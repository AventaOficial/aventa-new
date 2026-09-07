'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { offerRequiresAffiliateValidation } from '@/lib/moderation/approveReadiness';
import { humanizeAffiliateApproveError } from '@/lib/moderation/monetizationReadiness';
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

export type UseModerationFocusQueueOptions = {
  sourceTab: FocusSourceTab;
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

export function useModerationFocusQueue({ sourceTab }: UseModerationFocusQueueOptions) {
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
  const [sessionCursor, setSessionCursor] = useState(0);
  const [oldestCreatedAt, setOldestCreatedAt] = useState<string | null>(null);

  const claimInFlightRef = useRef(false);
  const actingRef = useRef(false);
  const heldLockIdRef = useRef<string | null>(null);
  const lockSupportedRef = useRef(true);
  const originalUrlRef = useRef<Map<string, string>>(new Map());
  const excludeRef = useRef<string[]>([]);

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
      if (action !== 'release') heldLockIdRef.current = offerId;
      if (action === 'release' && heldLockIdRef.current === offerId) heldLockIdRef.current = null;
      return { ok: true as const };
    },
    [authHeaders, session?.access_token]
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
        const exclude = [
          ...new Set([...(options?.excludeOfferIds ?? []), ...excludeRef.current]),
        ].slice(-40);
        const res = await fetch('/api/admin/moderation/claim-next', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            releaseOfferId: options?.releaseOfferId ?? heldLockIdRef.current,
            excludeOfferIds: exclude.filter((id) => id !== '__retry__'),
            sourceTab,
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
            excludeRef.current = [...excludeRef.current, ...extra].slice(-40);
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
          });
        }
        if (data?.claimed && data?.offer) {
          const claimed = mapOffer(data.offer as Record<string, unknown>);
          const claimedOriginal = focusClaimOriginalRefValue(claimed.original_offer_url);
          if (claimedOriginal) {
            originalUrlRef.current.set(claimed.id, claimedOriginal);
          } else {
            originalUrlRef.current.delete(claimed.id);
          }
          heldLockIdRef.current = claimed.id;
          setOffer(claimed);
          setNeedsAffiliateConfirm(false);
          setHistory((prev) => {
            const without = prev.filter((o) => o.id !== claimed.id);
            return [...without, claimed].slice(-30);
          });
          setHistoryIndex(-1);
          setSessionCursor((n) => n + 1);
          return claimed.id;
        }
        setOffer(null);
        heldLockIdRef.current = null;
        return null;
      } finally {
        claimInFlightRef.current = false;
      }
    },
    [authHeaders, session?.access_token, sourceTab]
  );

  // Bootstrap: pending count + first claim
  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/admin/moderation-pending-offers', {
          headers: authHeaders(),
        });
        if (res.ok) {
          const body = (await res.json()) as { offers?: FocusModerationOffer[] };
          const rows = body.offers ?? [];
          if (!cancelled && rows.length > 0) {
            const oldest = rows.reduce((a, b) =>
              new Date(a.created_at).getTime() < new Date(b.created_at).getTime() ? a : b
            );
            setOldestCreatedAt(oldest.created_at);
            setStats((s) => ({
              ...s,
              globalPending: Math.max(s.globalPending, rows.length),
            }));
          }
        }
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

  // Heartbeat
  useEffect(() => {
    if (!offer?.id || !session?.access_token) return;
    const id = offer.id;
    void postLock(id, 'acquire');
    const t = setInterval(() => {
      void postLock(id, 'heartbeat');
    }, 60_000);
    return () => {
      clearInterval(t);
    };
  }, [offer?.id, postLock, session?.access_token]);

  // Release lock on unmount
  useEffect(() => {
    return () => {
      const id = heldLockIdRef.current;
      if (id) void postLock(id, 'release');
    };
  }, [postLock]);

  const approve = useCallback(async () => {
    if (!offer || actingRef.current) return { ok: false as const };
    // Gate UI: usa URL operativa en memoria; no inventa original persistido.
    const needs = offerRequiresAffiliateValidation(
      focusOriginalProductUrlForRequest({
        originalOfferUrl: offer.original_offer_url,
        refOriginal: originalUrlRef.current.get(offer.id),
      }) ?? offer.offer_url
    );
    if (needs && offer.link_mod_ok !== true) {
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
      const originalUrl = focusOriginalProductUrlForRequest({
        originalOfferUrl: current.original_offer_url,
        refOriginal: originalUrlRef.current.get(current.id),
      });
      if (originalUrl) body.original_product_url = originalUrl;

      const res = await fetch('/api/admin/moderate-offer', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          humanizeAffiliateApproveError(
            typeof err?.error === 'string' ? err.error : 'No se pudo aprobar'
          )
        );
      }
      if (current.created_by) {
        void fetch('/api/reputation/increment-approved', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ userId: current.created_by }),
        }).catch(() => {});
      }
      originalUrlRef.current.delete(current.id);
      heldLockIdRef.current = null;
      excludeRef.current = [...excludeRef.current, current.id].slice(-40);
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
  }, [authHeaders, claimNext, offer]);

  const reject = useCallback(
    async (reason: string) => {
      if (!offer || actingRef.current) return { ok: false as const };
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
        heldLockIdRef.current = null;
        excludeRef.current = [...excludeRef.current, current.id].slice(-40);
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
    [authHeaders, claimNext, offer]
  );

  const snooze = useCallback(
    async (minutes: 15 | 60 | 240) => {
      if (!offer || actingRef.current) return { ok: false as const };
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
        heldLockIdRef.current = null;
        excludeRef.current = [...excludeRef.current, current.id].slice(-40);
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
    [authHeaders, claimNext, offer]
  );

  const confirmAffiliateAndApprove = useCallback(async () => {
    if (!offer || actingRef.current) return { ok: false as const };
    actingRef.current = true;
    setActing(true);
    setError(null);
    try {
      const trustedOriginal = focusOriginalProductUrlForRequest({
        originalOfferUrl: offer.original_offer_url,
        refOriginal: originalUrlRef.current.get(offer.id),
      });
      const res = await fetch('/api/admin/update-offer', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          id: offer.id,
          offer_url: offer.offer_url,
          affiliate_paste: true,
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
      setOffer((prev) =>
        prev
          ? {
              ...prev,
              link_mod_ok: data?.link_mod_ok === true ? true : prev.link_mod_ok,
              offer_url: typeof data?.offer_url === 'string' ? data.offer_url : prev.offer_url,
            }
          : prev
      );
      actingRef.current = false;
      setActing(false);
      // Re-approve with updated link_mod_ok
      setOffer((prev) => (prev ? { ...prev, link_mod_ok: true } : prev));
      // Direct approve call after marking ok
      actingRef.current = true;
      setActing(true);
      const current = offer;
      const body: Record<string, unknown> = {
        id: current.id,
        status: 'approved',
      };
      const originalUrl = focusOriginalProductUrlForRequest({
        originalOfferUrl: current.original_offer_url,
        refOriginal: originalUrlRef.current.get(current.id),
      });
      if (originalUrl) body.original_product_url = originalUrl;
      // Force link path: update already set link_mod_ok server-side
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
      heldLockIdRef.current = null;
      excludeRef.current = [...excludeRef.current, current.id].slice(-40);
      setNeedsAffiliateConfirm(false);
      await claimNext({ releaseOfferId: current.id, excludeOfferIds: [current.id] });
      return { ok: true as const };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar el enlace');
      return { ok: false as const };
    } finally {
      actingRef.current = false;
      setActing(false);
    }
  }, [authHeaders, claimNext, offer]);

  const goNext = useCallback(async () => {
    if (actingRef.current) return;
    if (historyIndex >= 0 && historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setOffer(history[nextIdx] ?? null);
      return;
    }
    if (offer?.id) {
      excludeRef.current = [...excludeRef.current, offer.id].slice(-40);
      await claimNext({ releaseOfferId: offer.id, excludeOfferIds: [offer.id] });
    } else {
      await claimNext();
    }
  }, [claimNext, history, historyIndex, offer?.id]);

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

  const position = Math.max(1, sessionCursor);
  const total = Math.max(stats.globalPending, stats.availableEstimate, position);

  return {
    offer,
    loading,
    acting,
    error,
    stats,
    oldestCreatedAt,
    position,
    total,
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
    dismissAffiliateGate,
    setError,
  };
}
