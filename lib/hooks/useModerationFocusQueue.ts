'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { offerRequiresAffiliateValidation } from '@/lib/moderation/approveReadiness';
import { humanizeAffiliateApproveError } from '@/lib/moderation/monetizationReadiness';
import { evaluateAffiliateReadiness } from '@/lib/moderation/affiliateReadinessContract';
import {
  focusClaimOriginalRefValue,
  focusOriginalProductUrlForRequest,
} from '@/lib/moderation/originalOfferUrlPolicy';
import { requestModerationLock } from '@/lib/moderation/moderationLockClient';
import type {
  FocusModerationOffer,
  FocusQueueStats,
  FocusSourceTab,
} from '@/lib/moderation/focusTypes';
import {
  buildSessionExcludeIds,
  bumpReviewedCount,
  formatFocusSessionCounter,
  markSessionOffer,
  SESSION_HISTORY_CAP,
  type ModerationSessionState,
} from '@/lib/moderation/moderationSessionState';
import {
  loadModerationSessionState,
  saveModerationSessionState,
} from '@/lib/moderation/moderationSessionStorage';
import { recordFocusSessionTelemetry } from '@/lib/moderation/focusSessionTelemetry';
import type { ClaimKind } from '@/lib/moderation/claimNextModerationOffer';

export type UseModerationFocusQueueOptions = {
  sourceTab: FocusSourceTab;
  /** Deep-link: oferta a atender primero. Se consume una sola vez, en el claim inicial. */
  preferOfferId?: string | null;
};

function mapOffer(row: Record<string, unknown>): FocusModerationOffer {
  return {
    ...(row as FocusModerationOffer),
    is_bot: Boolean((row as { is_bot?: boolean }).is_bot),
    profiles: Array.isArray(row.profiles)
      ? (row.profiles[0] as FocusModerationOffer['profiles'])
      : (row.profiles as FocusModerationOffer['profiles']),
  };
}

export function useModerationFocusQueue({
  sourceTab,
  preferOfferId = null,
}: UseModerationFocusQueueOptions) {
  const { session } = useAuth();
  const [offer, setOffer] = useState<FocusModerationOffer | null>(null);
  const [history, setHistory] = useState<FocusModerationOffer[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [stats, setStats] = useState<FocusQueueStats>({ globalPending: 0, availableEstimate: 0 });
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsAffiliateConfirm, setNeedsAffiliateConfirm] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [oldestCreatedAt, setOldestCreatedAt] = useState<string | null>(null);
  const [lastClaimKind, setLastClaimKind] = useState<ClaimKind | null>(null);
  /** Lease servidor activo — independiente de offer mostrado en historial. */
  const [activeLeaseOfferId, setActiveLeaseOfferId] = useState<string | null>(null);

  const claimInFlightRef = useRef(false);
  const actingRef = useRef(false);
  const heldLockIdRef = useRef<string | null>(null);
  const lockSupportedRef = useRef(true);
  const originalUrlRef = useRef<Map<string, string>>(new Map());
  const sessionStateRef = useRef<ModerationSessionState | null>(null);
  const preferOfferIdRef = useRef<string | null>(preferOfferId);

  const setHeldLease = useCallback((offerId: string | null) => {
    heldLockIdRef.current = offerId;
    setActiveLeaseOfferId(offerId);
  }, []);

  const persistSession = useCallback(
    (next: ModerationSessionState) => {
      sessionStateRef.current = next;
      setReviewedCount(next.reviewedCount);
      saveModerationSessionState(session?.user?.id, sourceTab, next);
    },
    [session?.user?.id, sourceTab]
  );

  // Cargar / rehidratar sesión por moderador + tab (sobrevive refresh).
  useEffect(() => {
    if (!session?.user?.id) {
      sessionStateRef.current = null;
      setReviewedCount(0);
      return;
    }
    const loaded = loadModerationSessionState(session.user.id, sourceTab);
    sessionStateRef.current = loaded;
    setReviewedCount(loaded.reviewedCount);
  }, [session?.user?.id, sourceTab]);

  const authHeaders = useCallback((): HeadersInit => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
    return h;
  }, [session?.access_token]);

  useEffect(() => {
    if (!session?.user?.id) {
      setIsOwner(false);
      setIsAdmin(false);
      return;
    }
    const supabase = createClient();
    void supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .then(({ data }) => {
        const roles = (data ?? []) as { role: string }[];
        setIsOwner(roles.some((r) => r.role === 'owner'));
        setIsAdmin(roles.some((r) => r.role === 'admin'));
      });
  }, [session?.user?.id]);

  const postLock = useCallback(
    async (offerId: string, action: 'acquire' | 'release' | 'heartbeat') => {
      if (!lockSupportedRef.current || !session?.access_token) return { ok: true as const };
      const result = await requestModerationLock({
        offerId,
        action,
        headers: authHeaders(),
      });
      if (result.ok && result.lockSupported === false) {
        lockSupportedRef.current = false;
        return { ok: true as const };
      }
      if (!result.ok && result.conflict) {
        return { ok: false as const, conflict: true as const };
      }
      if (!result.ok) {
        // HTTP error o fallo de red transitorio — sin setError / sin throw.
        return { ok: false as const };
      }
      if (action === 'release') {
        if (heldLockIdRef.current === offerId) setHeldLease(null);
      } else if (heldLockIdRef.current === offerId || heldLockIdRef.current == null) {
        // Solo adoptar lease en acquire/heartbeat del held actual — nunca por offer de historial.
        setHeldLease(offerId);
      }
      return { ok: true as const };
    },
    [authHeaders, session?.access_token, setHeldLease]
  );

  const claimNext = useCallback(
    async (options?: {
      releaseOfferId?: string | null;
      excludeOfferIds?: string[];
      retried?: boolean;
    }) => {
      if (!session?.access_token || claimInFlightRef.current) return null;
      claimInFlightRef.current = true;
      setError(null);
      try {
        const sess =
          sessionStateRef.current ??
          loadModerationSessionState(session.user?.id, sourceTab);
        sessionStateRef.current = sess;
        const exclude = [
          ...new Set([
            ...buildSessionExcludeIds(sess),
            ...(options?.excludeOfferIds ?? []),
          ]),
        ];
        // Se consume una vez: tras el primer claim la cola vuelve a su orden normal.
        const prefer = preferOfferIdRef.current;
        preferOfferIdRef.current = null;
        const res = await fetch('/api/admin/moderation/claim-next', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            releaseOfferId: options?.releaseOfferId ?? heldLockIdRef.current,
            excludeOfferIds: exclude,
            sourceTab,
            sessionId: sess.sessionId,
            ...(prefer ? { preferOfferId: prefer } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            typeof data?.error === 'string'
              ? data.error
              : 'No se pudo obtener la siguiente oferta';
          if (res.status === 409 || /tomad|lock|ocupad|conflicto/i.test(msg)) {
            setError('Esta oferta ya fue tomada por otra persona.');
            const extra = options?.excludeOfferIds ?? [];
            if (extra.length > 0) {
              let next = sess;
              for (const id of extra) next = markSessionOffer(next, id, 'skipped');
              persistSession(next);
            }
            if (!options?.retried) {
              claimInFlightRef.current = false;
              return claimNext({
                releaseOfferId: options?.releaseOfferId,
                excludeOfferIds: extra,
                retried: true,
              });
            }
          } else {
            setError(msg);
          }
          setOffer(null);
          return null;
        }
        if (data?.stats) {
          setStats({
            globalPending: Number(data.stats.globalPending) || 0,
            availableEstimate: Number(data.stats.availableEstimate) || 0,
            pendingGt24h: Number(data.stats.pendingGt24h) || 0,
            claimedActive: Number(data.stats.claimedActive) || 0,
            candidateCap: Number(data.stats.candidateCap) || undefined,
          });
          if (typeof data.stats.oldestPendingCreatedAt === 'string') {
            setOldestCreatedAt(data.stats.oldestPendingCreatedAt);
          }
        }
        if (data?.claimed && data?.offer) {
          const claimed = mapOffer(data.offer as Record<string, unknown>);
          const claimKind =
            data.claimKind === 'stale_reclaim' ||
            data.claimKind === 'reclaim_own' ||
            data.claimKind === 'fresh'
              ? (data.claimKind as ClaimKind)
              : 'fresh';
          const claimedOriginal = focusClaimOriginalRefValue(claimed.original_offer_url);
          if (claimedOriginal) {
            originalUrlRef.current.set(claimed.id, claimedOriginal);
          } else {
            originalUrlRef.current.delete(claimed.id);
          }
          setHeldLease(claimed.id);
          setOffer(claimed);
          setLastClaimKind(claimKind);
          setNeedsAffiliateConfirm(false);
          setHistory((prev) => {
            const without = prev.filter((o) => o.id !== claimed.id);
            return [...without, claimed].slice(-SESSION_HISTORY_CAP);
          });
          setHistoryIndex(-1);
          persistSession(bumpReviewedCount(sess));
          recordFocusSessionTelemetry({
            event: claimKind === 'stale_reclaim' ? 'stale_reclaim' : 'claim',
            offerId: claimed.id,
            sessionId: sess.sessionId,
            claimKind,
          });
          return claimed.id;
        }
        setOffer(null);
        setHeldLease(null);
        setLastClaimKind(null);
        return null;
      } finally {
        claimInFlightRef.current = false;
      }
    },
    [authHeaders, persistSession, session?.access_token, session?.user?.id, setHeldLease, sourceTab]
  );

  // Bootstrap: un solo claim-next (stats + oldest vienen del mismo response).
  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        if (!cancelled) await claimNext();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Solo al montar / cambio de tab o sesión
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, sourceTab]);

  // Heartbeat SOLO del lease servidor activo — no depende de historial / offer mostrado.
  useEffect(() => {
    if (!session?.access_token || !activeLeaseOfferId) return;
    const id = activeLeaseOfferId;
    void postLock(id, 'acquire');
    const t = setInterval(() => {
      if (heldLockIdRef.current !== id) return;
      void postLock(id, 'heartbeat');
    }, 60_000);
    return () => {
      clearInterval(t);
    };
  }, [activeLeaseOfferId, postLock, session?.access_token]);

  // Release lock on unmount
  useEffect(() => {
    return () => {
      const id = heldLockIdRef.current;
      if (id) void postLock(id, 'release');
    };
  }, [postLock]);

  const approve = useCallback(async () => {
    if (!offer || actingRef.current) return { ok: false as const };
    if (historyIndex >= 0) {
      setError('Estás en historial. Vuelve a la oferta activa para decidir.');
      return { ok: false as const };
    }
    // Gate UI: misma autoridad que approve (contrato canónico).
    const originalUrl = focusOriginalProductUrlForRequest({
      originalOfferUrl: offer.original_offer_url,
      refOriginal: originalUrlRef.current.get(offer.id),
    });
    const readiness = evaluateAffiliateReadiness({
      offerUrl: offer.offer_url,
      originalOfferUrl: originalUrl ?? offer.original_offer_url,
      linkModOk: offer.link_mod_ok,
    });
    if (!readiness.ready && readiness.programRequired) {
      setNeedsAffiliateConfirm(true);
      setError('Falta confirmar el enlace antes de aprobar.');
      return { ok: false as const, needsAffiliate: true as const };
    }

    actingRef.current = true;
    setActing(true);
    setError(null);
    const current = offer;
    try {
      const body: Record<string, unknown> = {
        id: current.id,
        status: 'approved',
      };
      const originalForBody = focusOriginalProductUrlForRequest({
        originalOfferUrl: current.original_offer_url,
        refOriginal: originalUrlRef.current.get(current.id),
      });
      if (originalForBody) body.original_product_url = originalForBody;

      const res = await fetch('/api/admin/moderate-offer', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const raw = typeof err?.error === 'string' ? err.error : 'No se pudo aprobar';
        const human = humanizeAffiliateApproveError(raw);
        if (human === 'Falta preparar el enlace para Aventa.') {
          setNeedsAffiliateConfirm(true);
        }
        throw new Error(human);
      }
      if (current.created_by) {
        void fetch('/api/reputation/increment-approved', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ userId: current.created_by }),
        }).catch(() => {});
      }
      originalUrlRef.current.delete(current.id);
      setHeldLease(null);
      const sess = sessionStateRef.current;
      if (sess) persistSession(markSessionOffer(sess, current.id, 'actioned'));
      recordFocusSessionTelemetry({
        event: 'approve',
        offerId: current.id,
        sessionId: sess?.sessionId,
      });
      setNeedsAffiliateConfirm(false);
      await claimNext({ releaseOfferId: current.id, excludeOfferIds: [current.id] });
      return { ok: true as const };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aprobar');
      return { ok: false as const };
    } finally {
      actingRef.current = false;
      setActing(false);
    }
  }, [authHeaders, claimNext, offer, persistSession, historyIndex, setHeldLease]);

  const reject = useCallback(
    async (reason: string) => {
      if (!offer || actingRef.current) return { ok: false as const };
      if (historyIndex >= 0) {
        setError('Estás en historial. Vuelve a la oferta activa para decidir.');
        return { ok: false as const };
      }
      if (!reason.trim()) {
        setError('Elige un motivo para rechazar.');
        return { ok: false as const };
      }
      actingRef.current = true;
      setActing(true);
      setError(null);
      const current = offer;
      try {
        const res = await fetch('/api/admin/moderate-offer', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            id: current.id,
            status: 'rejected',
            reason: reason.trim(),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(typeof err?.error === 'string' ? err.error : 'No se pudo rechazar');
        }
        if (current.created_by) {
          void fetch('/api/reputation/increment-rejected', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ userId: current.created_by }),
          }).catch(() => {});
        }
        setHeldLease(null);
        const sess = sessionStateRef.current;
        if (sess) persistSession(markSessionOffer(sess, current.id, 'actioned'));
        recordFocusSessionTelemetry({
          event: 'reject',
          offerId: current.id,
          sessionId: sess?.sessionId,
        });
        await claimNext({ releaseOfferId: current.id, excludeOfferIds: [current.id] });
        return { ok: true as const };
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo rechazar');
        return { ok: false as const };
      } finally {
        actingRef.current = false;
        setActing(false);
      }
    },
    [authHeaders, claimNext, offer, persistSession, historyIndex, setHeldLease]
  );

  const snooze = useCallback(
    async (minutes: 15 | 60 | 240) => {
      if (!offer || actingRef.current) return { ok: false as const };
      if (historyIndex >= 0) {
        setError('Estás en historial. Vuelve a la oferta activa para decidir.');
        return { ok: false as const };
      }
      actingRef.current = true;
      setActing(true);
      setError(null);
      const current = offer;
      try {
        const res = await fetch('/api/admin/moderation-snooze', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ offerId: current.id, minutes }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(typeof err?.error === 'string' ? err.error : 'No se pudo posponer');
        }
        setHeldLease(null);
        const sess = sessionStateRef.current;
        if (sess) persistSession(markSessionOffer(sess, current.id, 'actioned'));
        recordFocusSessionTelemetry({
          event: 'snooze',
          offerId: current.id,
          sessionId: sess?.sessionId,
        });
        await claimNext({ releaseOfferId: current.id, excludeOfferIds: [current.id] });
        return { ok: true as const };
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo posponer');
        return { ok: false as const };
      } finally {
        actingRef.current = false;
        setActing(false);
      }
    },
    [authHeaders, claimNext, offer, persistSession, historyIndex, setHeldLease]
  );
  const applyOfferUrlWrite = useCallback(
    (patch: { offer_url: string; link_mod_ok: boolean | null | undefined }) => {
      setOffer((prev) =>
        prev
          ? {
              ...prev,
              offer_url: patch.offer_url,
              link_mod_ok:
                patch.link_mod_ok === true
                  ? true
                  : patch.link_mod_ok === false
                    ? false
                    : prev.link_mod_ok,
            }
          : prev
      );
      setHistory((prev) =>
        prev.map((o) =>
          o.id === offer?.id
            ? {
                ...o,
                offer_url: patch.offer_url,
                link_mod_ok:
                  patch.link_mod_ok === true
                    ? true
                    : patch.link_mod_ok === false
                      ? false
                      : o.link_mod_ok,
              }
            : o
        )
      );
    },
    [offer?.id]
  );

  const confirmAffiliateAndApprove = useCallback(async () => {
    if (!offer || actingRef.current) return { ok: false as const };
    if (historyIndex >= 0) {
      setError('Estás en historial. Vuelve a la oferta activa para decidir.');
      return { ok: false as const };
    }
    actingRef.current = true;
    setActing(true);
    setError(null);
    try {
      const trustedOriginal = focusOriginalProductUrlForRequest({
        originalOfferUrl: offer.original_offer_url,
        refOriginal: originalUrlRef.current.get(offer.id),
      });
      const affiliatePaste = offerRequiresAffiliateValidation(
        trustedOriginal || offer.original_offer_url || offer.offer_url
      );
      const res = await fetch('/api/admin/update-offer', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          id: offer.id,
          offer_url: offer.offer_url,
          affiliate_paste: affiliatePaste,
          ...(trustedOriginal ? { original_product_url: trustedOriginal } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          typeof err?.error === 'string' ? err.error : 'No se pudo confirmar el enlace'
        );
      }
      const data = await res.json().catch(() => ({}));
      const nextUrl =
        typeof data?.offer_url === 'string' ? data.offer_url : (offer.offer_url ?? '');
      const nextLinkModOk =
        data?.link_mod_ok === true ? true : data?.link_mod_ok === false ? false : true;
      applyOfferUrlWrite({ offer_url: nextUrl, link_mod_ok: nextLinkModOk });

      const currentId = offer.id;
      const body: Record<string, unknown> = {
        id: currentId,
        status: 'approved',
      };
      const originalUrl = focusOriginalProductUrlForRequest({
        originalOfferUrl: offer.original_offer_url,
        refOriginal: originalUrlRef.current.get(currentId),
      });
      if (originalUrl) body.original_product_url = originalUrl;
      const modRes = await fetch('/api/admin/moderate-offer', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!modRes.ok) {
        const err = await modRes.json().catch(() => ({}));
        throw new Error(
          humanizeAffiliateApproveError(
            typeof err?.error === 'string' ? err.error : 'No se pudo aprobar'
          )
        );
      }
      setHeldLease(null);
      const sessAff = sessionStateRef.current;
      if (sessAff) persistSession(markSessionOffer(sessAff, currentId, 'actioned'));
      recordFocusSessionTelemetry({
        event: 'approve',
        offerId: currentId,
        sessionId: sessAff?.sessionId,
      });
      setNeedsAffiliateConfirm(false);
      await claimNext({ releaseOfferId: currentId, excludeOfferIds: [currentId] });
      return { ok: true as const };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar el enlace');
      return { ok: false as const };
    } finally {
      actingRef.current = false;
      setActing(false);
    }
  }, [applyOfferUrlWrite, authHeaders, claimNext, offer, persistSession, historyIndex, setHeldLease]);

  const goNext = useCallback(async () => {
    if (actingRef.current) return;
    if (historyIndex >= 0 && historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setOffer(history[nextIdx] ?? null);
      return;
    }
    // Salir de historial al vivo sin skip / sin tocar lease
    if (historyIndex >= 0 && historyIndex === history.length - 1) {
      setHistoryIndex(-1);
      const liveId = heldLockIdRef.current;
      const live =
        (liveId ? history.find((o) => o.id === liveId) : null) ??
        history[history.length - 1] ??
        offer;
      setOffer(live);
      return;
    }
    // Skip solo desde oferta con lease activo (no desde snapshot de historial).
    const liveId = heldLockIdRef.current ?? offer?.id ?? null;
    if (liveId) {
      const sess = sessionStateRef.current;
      if (sess) {
        const next = markSessionOffer(sess, liveId, 'skipped');
        persistSession(next);
        recordFocusSessionTelemetry({
          event: 'skip',
          offerId: liveId,
          sessionId: next.sessionId,
        });
      }
      await claimNext({ releaseOfferId: liveId, excludeOfferIds: [liveId] });
    } else {
      await claimNext();
    }
  }, [claimNext, history, historyIndex, offer, persistSession]);

  const goPrev = useCallback(() => {
    if (actingRef.current) return;
    const stack = history;
    if (stack.length === 0) return;
    const currentId = offer?.id;
    let idx = historyIndex;
    if (idx < 0) {
      idx = stack.findIndex((o) => o.id === currentId);
      if (idx < 0) idx = stack.length;
    }
    const prevIdx = Math.max(0, idx - 1);
    if (prevIdx === idx && historyIndex >= 0) return;
    setHistoryIndex(prevIdx);
    setOffer(stack[prevIdx] ?? null);
  }, [history, historyIndex, offer?.id]);

  const dismissAffiliateGate = useCallback(() => {
    setNeedsAffiliateConfirm(false);
    setError(null);
  }, []);

  /** Guarda enlace afiliado pegado (sin aprobar). No inventa original_offer_url. */
  const prepareAffiliateLink = useCallback(
    async (pastedUrl: string): Promise<{ ok: boolean; error?: string }> => {
      if (!offer || actingRef.current) return { ok: false, error: 'No hay oferta activa' };
      if (historyIndex >= 0) {
        return { ok: false, error: 'Estás en historial. Vuelve a la oferta activa.' };
      }
      const pasted = pastedUrl.trim();
      if (!pasted) return { ok: false, error: 'Pega el enlace' };

      actingRef.current = true;
      setActing(true);
      setError(null);
      try {
        const trustedOriginal = focusOriginalProductUrlForRequest({
          originalOfferUrl: offer.original_offer_url,
          refOriginal: originalUrlRef.current.get(offer.id),
        });
        // Programa se decide por el producto original, no por lo pegado.
        const affiliatePaste = offerRequiresAffiliateValidation(
          trustedOriginal || offer.original_offer_url || pasted
        );
        const res = await fetch('/api/admin/update-offer', {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({
            id: offer.id,
            offer_url: pasted,
            affiliate_paste: affiliatePaste,
            ...(trustedOriginal ? { original_product_url: trustedOriginal } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            ok: false,
            error:
              typeof data?.error === 'string' ? data.error : 'No se pudo guardar el enlace',
          };
        }
        const nextUrl = typeof data?.offer_url === 'string' ? data.offer_url : pasted;
        // Confiar en la respuesta del servidor — no inventar link_mod_ok en cliente.
        const nextLinkModOk =
          data?.link_mod_ok === true
            ? true
            : data?.link_mod_ok === false
              ? false
              : offer.link_mod_ok;
        applyOfferUrlWrite({ offer_url: nextUrl, link_mod_ok: nextLinkModOk });
        setNeedsAffiliateConfirm(false);
        setError(null);
        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : 'No se pudo guardar el enlace',
        };
      } finally {
        actingRef.current = false;
        setActing(false);
      }
    },
    [applyOfferUrlWrite, authHeaders, historyIndex, offer]
  );

  /** Aplica respuesta de update-offer (edición completa) al offer + history. */
  const applyOfferEditResult = useCallback(
    (data: Record<string, unknown> | undefined) => {
      if (!data || !offer) return;
      const patch: Partial<FocusModerationOffer> = {};
      if (typeof data.title === 'string') patch.title = data.title;
      if (typeof data.price === 'number') patch.price = data.price;
      if (data.original_price === null) patch.original_price = null;
      else if (typeof data.original_price === 'number') patch.original_price = data.original_price;
      if (data.description === null) patch.description = null;
      else if (typeof data.description === 'string') patch.description = data.description;
      if (data.category === null) patch.category = null;
      else if (typeof data.category === 'string') patch.category = data.category;
      if (data.image_url === null) patch.image_url = null;
      else if (typeof data.image_url === 'string') patch.image_url = data.image_url;
      if (Array.isArray(data.image_urls)) {
        patch.image_urls = data.image_urls.filter(
          (u): u is string => typeof u === 'string'
        );
      } else if (data.image_urls === null) {
        patch.image_urls = null;
      }
      if (typeof data.offer_url === 'string') patch.offer_url = data.offer_url;
      else if (data.offer_url === null) patch.offer_url = null;
      if (data.coupons === null) patch.coupons = null;
      else if (typeof data.coupons === 'string') patch.coupons = data.coupons;
      if (data.bank_coupon === null) patch.bank_coupon = null;
      else if (typeof data.bank_coupon === 'string') patch.bank_coupon = data.bank_coupon;
      if (data.msi_months === null) patch.msi_months = null;
      else if (typeof data.msi_months === 'number') patch.msi_months = data.msi_months;
      if (data.link_mod_ok === true) patch.link_mod_ok = true;
      else if (data.link_mod_ok === false) patch.link_mod_ok = false;

      if (Object.keys(patch).length === 0) return;

      setOffer((prev) => (prev ? { ...prev, ...patch } : prev));
      setHistory((prev) =>
        prev.map((o) => (o.id === offer.id ? { ...o, ...patch } : o))
      );
      if (data.demoted === true) {
        setError('La oferta live volvió a pending por un cambio material. Revísala de nuevo.');
      }
    },
    [offer]
  );

  const viewingHistory = historyIndex >= 0;
  const sessionCounterLabel = formatFocusSessionCounter({
    reviewedCount,
    globalPending: stats.globalPending,
    viewingHistory,
  });

  return {
    offer,
    loading,
    acting,
    error,
    stats,
    oldestCreatedAt,
    reviewedCount,
    sessionCounterLabel,
    viewingHistory,
    lastClaimKind,
    needsAffiliateConfirm,
    isOwner,
    isAdmin,
    canAdvanced: isOwner || isAdmin,
    currentUserId: session?.user?.id ?? null,
    approve,
    reject,
    snooze,
    goNext,
    goPrev,
    claimNext,
    confirmAffiliateAndApprove,
    prepareAffiliateLink,
    applyOfferEditResult,
    dismissAffiliateGate,
    setError,
  };
}
