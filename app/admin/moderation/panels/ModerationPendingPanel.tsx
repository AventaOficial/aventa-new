'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/providers/AuthProvider';
import {
  Search,
  CheckSquare,
  Square,
  Clock,
  Check,
  X,
  Trash2,
  Bot,
  Users,
  LayoutList,
  SlidersHorizontal,
} from 'lucide-react';
import { MODERATION_DELETE_BOT_CONFIRM_PHRASE } from '@/lib/moderation/deleteBotQueue';
import ModerationOfferDetail from '../../components/ModerationOfferDetail';
import ModerationDecisionCard from '../../components/ModerationDecisionCard';
import ModerationTurnSummaryModal, {
  type ModerationSessionSummary,
} from '../../components/ModerationTurnSummaryModal';
import ModerationMobileReview from '../../components/ModerationMobileReview';

import { ALL_CATEGORIES } from '@/lib/categories';
import { MODERATION_REJECTION_PRESETS } from '@/lib/moderation/rejectionPresets';
import { pendingBasePath, type ModerationHubMode, type ModerationQueueView } from '@/lib/moderation/hubConfig';
import { moderationUi } from '../moderationUi';
import {
  sortPendingOffersForModeration,
  offerMatchesVitalFilter,
  offerNeedsFixFilter,
} from '@/lib/moderation/sortPendingOffers';
import { isLowModerationTrust } from '@/lib/moderation/confidenceBadge';
import { useModerationQueueRealtime } from '@/lib/hooks/useModerationQueueRealtime';
import { isOfferLockedByOther } from '@/lib/moderation/moderationLock';
import {
  readModerationLastSeen,
  writeModerationLastSeen,
  defaultModerationSinceIso,
  wasModerationSummaryShownThisSession,
  markModerationSummaryShownThisSession,
  hasModerationSummaryActivity,
} from '@/lib/moderation/moderationSessionSummary';

const CATEGORY_OPTIONS = [
  { value: '', label: 'Todas' },
  ...ALL_CATEGORIES.map((c) => ({
    value: c.value,
    label: c.vital ? `${c.label} · Día a día` : c.label,
  })),
];

type ModerationOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  store: string | null;
  category?: string | null;
  bank_coupon?: string | null;
  coupons?: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  offer_url: string | null;
  description?: string | null;
  steps?: unknown;
  conditions?: string | null;
  created_at: string;
  created_by: string | null;
  risk_score?: number | null;
  moderator_comment?: string | null;
  /** jsonb con señales del bot de ingesta (vendidos, rating, intel de precio). */
  bot_meta?: unknown;
  profiles?: { display_name: string | null; avatar_url: string | null } | null;
  /** Resuelto en servidor (IDs de usuario bot + marcadores en comentario/descripción). */
  is_bot?: boolean;
  locked_by?: string | null;
  locked_at?: string | null;
  locked_by_name?: string | null;
  snoozed_until?: string | null;
};

type SourceTab = 'all' | 'bot' | 'users';

type SimilarOffer = {
  id: string;
  title: string;
  price: number;
  original_price: number | null;
  store: string | null;
  created_at: string;
};

function useSimilarOffers(store: string | null, title: string, offerUrl: string | null) {
  const [similar, setSimilar] = useState<SimilarOffer[]>([]);
  useEffect(() => {
    if (!store?.trim() && !title?.trim()) {
      setSimilar([]);
      return;
    }
    const params = new URLSearchParams();
    if (store?.trim()) params.set('store', store.trim());
    if (title?.trim()) params.set('title', title.trim());
    if (offerUrl?.trim()) params.set('offer_url', offerUrl.trim());
    let cancelled = false;
    fetch(`/api/offers/similar?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setSimilar(Array.isArray(data?.similar) ? data.similar : []);
      })
      .catch(() => {
        if (!cancelled) setSimilar([]);
      });
    return () => {
      cancelled = true;
    };
  }, [store, title, offerUrl]);
  return similar;
}

function sourceTabFromQueueView(queueView: ModerationQueueView): SourceTab {
  if (queueView === 'bot') return 'bot';
  if (queueView === 'hunters') return 'users';
  return 'all';
}

export type ModerationPendingPanelProps = {
  mode?: ModerationHubMode;
  queueView?: ModerationQueueView;
  basePath?: string;
};

export default function ModerationPendingPanel({
  mode = 'admin',
  queueView = 'split',
  basePath,
}: ModerationPendingPanelProps) {
  const moderationPath = basePath ?? pendingBasePath(mode);
  const pathname = usePathname();
  const { session } = useAuth();
  const [pending, setPending] = useState<ModerationOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sourceTab, setSourceTab] = useState<SourceTab>(() => sourceTabFromQueueView(queueView));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const refreshList = useCallback(
    (skipLoading = false) => {
      if (!skipLoading) setLoading(true);
      const headers: Record<string, string> = {};
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      return fetch('/api/admin/moderation-pending-offers', { headers })
        .then(async (res) => {
          if (!skipLoading) setLoading(false);
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            console.error('Error refreshing:', err?.error ?? res.status);
            return;
          }
          const body = (await res.json()) as { offers?: Record<string, unknown>[] };
          const rows = body.offers ?? [];
          setPending(
            rows.map((r) => ({
              ...r,
              is_bot: Boolean((r as { is_bot?: boolean }).is_bot),
              profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
            })) as ModerationOffer[]
          );
          setSelectedIds(new Set());
        })
        .catch((e) => {
          if (!skipLoading) setLoading(false);
          console.error('Error refreshing:', e);
        });
    },
    [session?.access_token]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchRejectReason, setBatchRejectReason] = useState('');
  const [showBatchReject, setShowBatchReject] = useState(false);
  const [batchActing, setBatchActing] = useState(false);
  const [storeFilter, setStoreFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [riskHighOnly, setRiskHighOnly] = useState(false);
  const [vitalOnlyFilter, setVitalOnlyFilter] = useState(false);
  const [needsFixFilter, setNeedsFixFilter] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showDeleteBotModal, setShowDeleteBotModal] = useState(false);
  const [deleteBotPhrase, setDeleteBotPhrase] = useState('');
  const [deleteBotAck, setDeleteBotAck] = useState(false);
  const [deleteBotLoading, setDeleteBotLoading] = useState(false);
  const [linkConfirmed, setLinkConfirmed] = useState(false);
  const [requestReject, setRequestReject] = useState(false);
  const [linkGateId, setLinkGateId] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [turnSummary, setTurnSummary] = useState<ModerationSessionSummary | null>(null);
  const [lockSupported, setLockSupported] = useState(true);
  const summaryFetchedRef = useRef(false);
  const heldLockIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) {
      setIsOwner(false);
      return;
    }
    const supabase = createClient();
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .then(({ data }) => {
        const roles = (data ?? []) as { role: string }[];
        setIsOwner(roles.some((r) => r.role === 'owner'));
        setIsAdmin(roles.some((r) => r.role === 'admin'));
      });
  }, [session?.user?.id]);

  const isBotOffer = useCallback(
    (o: ModerationOffer) =>
      o.is_bot === true ||
      (o.moderator_comment ?? '').toLowerCase().includes('[bot-ingest]') ||
      (o.description ?? '').toLowerCase().includes('ingesta automática (bot)'),
    []
  );

  const isQualityCandidate = (o: ModerationOffer) => {
    const hasUrl = Boolean(o.offer_url?.trim());
    const hasImage = Boolean(o.image_url?.trim());
    const hasPrice = Number(o.price ?? 0) > 0;
    const hasContext = Boolean(
      (o.description ?? '').trim() || (o.conditions ?? '').trim() || (o.coupons ?? '').trim()
    );
    const saneDiscount =
      o.original_price == null ||
      (Number(o.original_price) > Number(o.price) &&
        ((Number(o.original_price) - Number(o.price)) / Number(o.original_price)) * 100 >= 5);
    return hasUrl && hasImage && hasPrice && hasContext && saneDiscount;
  };

  const filtered = useMemo(() => {
    return pending.filter((o) => {
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase();
        if (
          !o.title?.toLowerCase().includes(q) &&
          !o.store?.toLowerCase().includes(q) &&
          !o.profiles?.display_name?.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      if (storeFilter && o.store !== storeFilter) return false;
      if (categoryFilter && (o.category ?? '') !== categoryFilter) return false;
      if (riskHighOnly && !isLowModerationTrust(o)) return false;
      if (dateFrom) {
        const d = new Date(o.created_at).toISOString().slice(0, 10);
        if (d < dateFrom) return false;
      }
      if (dateTo) {
        const d = new Date(o.created_at).toISOString().slice(0, 10);
        if (d > dateTo) return false;
      }
      return true;
    });
  }, [pending, debouncedSearch, storeFilter, categoryFilter, riskHighOnly, dateFrom, dateTo]);

  const botFiltered = useMemo(() => {
    let list = filtered.filter((o) => isBotOffer(o));
    if (vitalOnlyFilter) list = list.filter((o) => offerMatchesVitalFilter(o));
    if (needsFixFilter) list = list.filter((o) => offerNeedsFixFilter(o));
    return sortPendingOffersForModeration(list);
  }, [filtered, isBotOffer, vitalOnlyFilter, needsFixFilter]);

  const userFiltered = useMemo(() => {
    let list = filtered.filter((o) => !isBotOffer(o));
    if (vitalOnlyFilter) list = list.filter((o) => offerMatchesVitalFilter(o));
    if (needsFixFilter) list = list.filter((o) => offerNeedsFixFilter(o));
    return sortPendingOffersForModeration(list);
  }, [filtered, isBotOffer, vitalOnlyFilter, needsFixFilter]);

  const deskList = useMemo(() => {
    let list: ModerationOffer[];
    if (sourceTab === 'bot') list = botFiltered;
    else if (sourceTab === 'users') list = userFiltered;
    else list = sortPendingOffersForModeration([...botFiltered, ...userFiltered]);
    return list;
  }, [sourceTab, botFiltered, userFiltered]);

  useEffect(() => {
    setSourceTab(sourceTabFromQueueView(queueView));
  }, [queueView]);

  useEffect(() => {
    if (deskList.length === 0) {
      setSelectedId(null);
      setMobileShowDetail(false);
      return;
    }
    if (!selectedId || !deskList.some((o) => o.id === selectedId)) {
      setSelectedId(deskList[0].id);
    }
  }, [deskList, selectedId]);

  const selectedOffer = useMemo(
    () => deskList.find((o) => o.id === selectedId) ?? null,
    [deskList, selectedId]
  );

  const selectedReadOnly = useMemo(
    () =>
      selectedOffer
        ? isOfferLockedByOther(
            { locked_by: selectedOffer.locked_by, locked_at: selectedOffer.locked_at },
            session?.user?.id
          )
        : false,
    [selectedOffer, session?.user?.id]
  );

  const authHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  }, [session?.access_token]);

  const postLock = useCallback(
    async (offerId: string, action: 'acquire' | 'release' | 'heartbeat') => {
      if (!lockSupported) return { ok: true as const };
      const res = await fetch('/api/admin/moderation-lock', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ offerId, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.lockSupported === false) {
        setLockSupported(false);
        return { ok: true as const, unsupported: true as const };
      }
      if (res.status === 409) {
        setPending((prev) =>
          prev.map((o) =>
            o.id === offerId
              ? {
                  ...o,
                  locked_by: typeof data?.lockedBy === 'string' ? data.lockedBy : o.locked_by,
                  locked_at: typeof data?.lockedAt === 'string' ? data.lockedAt : o.locked_at,
                  locked_by_name:
                    typeof data?.lockedByName === 'string' ? data.lockedByName : o.locked_by_name,
                }
              : o
          )
        );
        return { ok: false as const, conflict: true as const };
      }
      if (!res.ok) return { ok: false as const };
      if (action !== 'release') {
        heldLockIdRef.current = offerId;
        setPending((prev) =>
          prev.map((o) =>
            o.id === offerId
              ? {
                  ...o,
                  locked_by: session?.user?.id ?? o.locked_by,
                  locked_at: new Date().toISOString(),
                  locked_by_name: null,
                }
              : o
          )
        );
      } else if (heldLockIdRef.current === offerId) {
        heldLockIdRef.current = null;
        setPending((prev) =>
          prev.map((o) =>
            o.id === offerId
              ? { ...o, locked_by: null, locked_at: null, locked_by_name: null }
              : o
          )
        );
      }
      return { ok: true as const };
    },
    [authHeaders, lockSupported, session?.user?.id]
  );

  useModerationQueueRealtime({
    enabled: Boolean(session?.access_token) && lockSupported,
    onOfferPatch: (patch) => {
      setPending((prev) =>
        prev.map((o) => (o.id === patch.id ? { ...o, ...patch } : o))
      );
    },
  });

  useEffect(() => {
    setLinkConfirmed(false);
    setLinkGateId((gate) => (gate && gate === selectedId ? gate : null));
  }, [selectedId]);

  useEffect(() => {
    if (!session?.user?.id || summaryFetchedRef.current) return;
    summaryFetchedRef.current = true;

    if (wasModerationSummaryShownThisSession(session.user.id)) {
      return;
    }

    const since = readModerationLastSeen(session.user.id) ?? defaultModerationSinceIso();
    const headers: Record<string, string> = {};
    if (session.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    fetch(`/api/admin/moderation-session-summary?since=${encodeURIComponent(since)}`, { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || typeof data.newOffers !== 'number') return;
        const summary = data as ModerationSessionSummary;
        if (!hasModerationSummaryActivity(summary)) {
          markModerationSummaryShownThisSession(session.user.id);
          writeModerationLastSeen(session.user.id);
          return;
        }
        setTurnSummary(summary);
      })
      .catch(() => {});
  }, [session?.access_token, session?.user?.id]);

  useEffect(() => {
    if (!selectedId || !session?.user?.id || selectedReadOnly) return;
    let cancelled = false;
    void (async () => {
      const result = await postLock(selectedId, 'acquire');
      if (cancelled || !result.ok) return;
    })();
    const interval = window.setInterval(() => {
      if (heldLockIdRef.current === selectedId) {
        void postLock(selectedId, 'heartbeat');
      }
    }, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (heldLockIdRef.current === selectedId) {
        void postLock(selectedId, 'release');
      }
    };
  }, [selectedId, selectedReadOnly, session?.user?.id, postLock]);

  const dismissTurnSummary = () => {
    if (session?.user?.id) {
      markModerationSummaryShownThisSession(session.user.id);
      writeModerationLastSeen(session.user.id);
    }
    setTurnSummary(null);
  };

  const runSnooze = async (offerId: string, minutes: 15 | 60 | 240) => {
    const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    setPending((prev) =>
      prev.map((o) =>
        o.id === offerId
          ? { ...o, snoozed_until: until, locked_by: null, locked_at: null, locked_by_name: null }
          : o
      )
    );
    if (heldLockIdRef.current === offerId) heldLockIdRef.current = null;
    const res = await fetch('/api/admin/moderation-snooze', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ offerId, minutes }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setActionError(typeof err?.error === 'string' ? err.error : 'No se pudo posponer la oferta');
      await refreshList(true);
      return;
    }
    const listSnapshot = deskList;
    const idx = listSnapshot.findIndex((o) => o.id === offerId);
    const nextSelectedId =
      listSnapshot[idx + 1]?.id ?? listSnapshot[idx - 1]?.id ?? null;
    setSelectedId(nextSelectedId);
    setMobileShowDetail((wasDetail) => wasDetail && Boolean(nextSelectedId));
    void refreshList(true);
  };

  const similarOffers = useSimilarOffers(
    selectedOffer?.store ?? null,
    selectedOffer?.title ?? '',
    selectedOffer?.offer_url ?? null
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size >= deskList.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(deskList.map((o) => o.id)));
  };

  const runBatchApprove = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBatchActing(true);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    for (const id of ids) {
      const offer = pending.find((o) => o.id === id);
      await fetch('/api/admin/moderate-offer', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, status: 'approved', batch_approve: true }),
      });
      if (offer?.created_by) {
        await fetch('/api/reputation/increment-approved', {
          method: 'POST',
          headers,
          body: JSON.stringify({ userId: offer.created_by }),
        }).catch(() => {});
      }
    }
    setBatchActing(false);
    setSelectedIds(new Set());
    await refreshList(true);
  };

  const runBatchReject = async () => {
    const ids = Array.from(selectedIds);
    const reason = batchRejectReason.trim();
    if (ids.length === 0 || !reason) return;
    setBatchActing(true);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    for (const id of ids) {
      const offer = pending.find((o) => o.id === id);
      await fetch('/api/admin/moderate-offer', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, status: 'rejected', reason }),
      });
      if (offer?.created_by) {
        await fetch('/api/reputation/increment-rejected', {
          method: 'POST',
          headers,
          body: JSON.stringify({ userId: offer.created_by }),
        }).catch(() => {});
      }
    }
    setBatchActing(false);
    setShowBatchReject(false);
    setBatchRejectReason('');
    setSelectedIds(new Set());
    await refreshList(true);
  };

  const runDeleteAllBotPending = async () => {
    if (deleteBotPhrase.trim() !== MODERATION_DELETE_BOT_CONFIRM_PHRASE || !deleteBotAck) return;
    setDeleteBotLoading(true);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    try {
      const res = await fetch('/api/admin/moderation-delete-bot-pending', {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirmPhrase: deleteBotPhrase.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(typeof data?.error === 'string' ? data.error : 'No se pudo eliminar la cola del bot');
        return;
      }
      setShowDeleteBotModal(false);
      setDeleteBotPhrase('');
      setDeleteBotAck(false);
      setSelectedIds(new Set());
      await refreshList(true);
      if (typeof data?.deleted === 'number' && data.deleted > 0) {
        alert(`Se eliminaron ${data.deleted} oferta(s) pendientes del bot.`);
      }
    } finally {
      setDeleteBotLoading(false);
    }
  };

  const runBatchExpire = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBatchActing(true);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    for (const id of ids) {
      await fetch('/api/admin/expire-offer', {
        method: 'POST',
        headers,
        body: JSON.stringify({ offerId: id }),
      });
    }
    setBatchActing(false);
    setSelectedIds(new Set());
    await refreshList(true);
  };

  useEffect(() => {
    const isPendingRoot =
      pathname === moderationPath ||
      pathname === `${moderationPath}/bot` ||
      pathname === `${moderationPath}/cazadores`;
    if (!isPendingRoot) return;
    const normalizeAndRefresh = async () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
      await fetch('/api/admin/moderation-normalize-links', {
        method: 'POST',
        headers,
        body: JSON.stringify({ limit: 250 }),
      }).catch(() => {});
      await refreshList(false);
    };
    void normalizeAndRefresh();

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshList(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [pathname, moderationPath, refreshList, session?.access_token]);

  const setStatus = async (
    id: string,
    status: 'approved' | 'rejected',
    createdBy?: string | null,
    reason?: string,
    modMessage?: string,
    offerHasUrl?: boolean
  ) => {
    const offer = pending.find((o) => o.id === id);
    if (!offer) return;

    setActionError(null);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const body: {
      id: string;
      status: string;
      reason?: string;
      mod_message?: string;
      link_mod_ok?: boolean;
    } = { id, status };
    if (reason) body.reason = reason;
    if (status === 'approved' && modMessage?.trim()) body.mod_message = modMessage.trim();
    if (status === 'approved' && offerHasUrl) body.link_mod_ok = true;

    try {
      const res = await fetch('/api/admin/moderate-offer', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err?.error === 'string' ? err.error : 'No se pudo actualizar la oferta');
      }

      const listSnapshot = deskList;
      const idx = listSnapshot.findIndex((o) => o.id === id);
      const nextSelectedId =
        listSnapshot[idx + 1]?.id ?? listSnapshot[idx - 1]?.id ?? null;

      setPending((prev) => prev.filter((o) => o.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setLinkGateId(null);
      setSelectedId(nextSelectedId);
      // En lista mobile: quedarse en la lista. En detalle: pasar a la siguiente.
      setMobileShowDetail((wasDetail) => wasDetail && Boolean(nextSelectedId));

      const repHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) repHeaders.Authorization = `Bearer ${session.access_token}`;
      if (status === 'approved' && createdBy) {
        fetch('/api/reputation/increment-approved', {
          method: 'POST',
          headers: repHeaders,
          body: JSON.stringify({ userId: createdBy }),
        }).catch(() => {});
      } else if (status === 'rejected' && createdBy) {
        fetch('/api/reputation/increment-rejected', {
          method: 'POST',
          headers: repHeaders,
          body: JSON.stringify({ userId: createdBy }),
        }).catch(() => {});
      }

      void refreshList(true);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'No se pudo actualizar la oferta');
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('moderation-search-input')?.focus();
      }
      if ((e.key === 'b' || e.key === 'B') && queueView === 'split') {
        setSourceTab((v) => (v === 'bot' ? 'all' : 'bot'));
      }
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setMobileShowDetail(false);
      }
      const navKeys = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'];
      if (navKeys.includes(e.key)) {
        if (deskList.length === 0) return;
        e.preventDefault();
        const idx = Math.max(
          0,
          deskList.findIndex((o) => o.id === selectedId)
        );
        const delta = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
        const nextIdx = Math.min(deskList.length - 1, Math.max(0, idx + delta));
        setSelectedId(deskList[nextIdx].id);
        setMobileShowDetail(true);
      }
      if ((e.key === 'a' || e.key === 'A') && selectedOffer && !selectedReadOnly) {
        if (selectedOffer.offer_url?.trim() && !linkConfirmed) return;
        e.preventDefault();
        void setStatus(
          selectedOffer.id,
          'approved',
          selectedOffer.created_by,
          undefined,
          undefined,
          Boolean(selectedOffer.offer_url?.trim())
        );
      }
      if ((e.key === 'r' || e.key === 'R') && selectedOffer && !selectedReadOnly) {
        e.preventDefault();
        setRequestReject(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queueView, deskList, selectedId, selectedOffer, selectedReadOnly, linkConfirmed]);

  const storesInList = [...new Set(pending.map((o) => o.store).filter(Boolean))] as string[];
  const canAdvancedModeration = isOwner || isAdmin;
  const ui = moderationUi(mode);

  const tabLocked = queueView !== 'split';

  const selectOffer = (id: string) => {
    setSelectedId(id);
    setLinkGateId(null);
  };

  const tryApproveFromList = (offer: ModerationOffer) => {
    if (
      isOfferLockedByOther(
        { locked_by: offer.locked_by, locked_at: offer.locked_at },
        session?.user?.id
      )
    ) {
      return;
    }
    const hasUrl = Boolean(offer.offer_url?.trim());
    const alreadySelected = selectedId === offer.id;
    if (!alreadySelected) setSelectedId(offer.id);
    if (hasUrl && !(alreadySelected && linkConfirmed) && linkGateId !== offer.id) {
      setLinkGateId(offer.id);
      return;
    }
    void setStatus(offer.id, 'approved', offer.created_by, undefined, undefined, hasUrl);
    setLinkGateId(null);
  };

  const confirmLinkAndApproveFromList = (offer: ModerationOffer) => {
    setLinkConfirmed(true);
    setLinkGateId(null);
    void setStatus(offer.id, 'approved', offer.created_by, undefined, undefined, true);
  };

  const tryRejectFromList = (offer: ModerationOffer) => {
    if (
      isOfferLockedByOther(
        { locked_by: offer.locked_by, locked_at: offer.locked_at },
        session?.user?.id
      )
    ) {
      return;
    }
    setSelectedId(offer.id);
    setLinkGateId(null);
    setRequestReject(true);
  };

  return (
    <div className="space-y-4">
      {/* —— Móvil: lista decision-first —— */}
      <div className="md:hidden">
        <ModerationMobileReview
          mode={mode}
          offers={deskList}
          selectedId={selectedId}
          sourceTab={sourceTab}
          tabLocked={queueView !== 'split'}
          currentUserId={session?.user?.id ?? null}
          linkConfirmed={linkConfirmed}
          onLinkConfirmedChange={setLinkConfirmed}
          actionError={actionError}
          onClearActionError={() => setActionError(null)}
          onSelect={(id) => setSelectedId(id)}
          onSourceTab={setSourceTab}
          onApprove={(id, createdBy, modMessage, offerHasUrl) => {
            void setStatus(id, 'approved', createdBy, undefined, modMessage, offerHasUrl);
          }}
          onReject={(id, reason) => void setStatus(id, 'rejected', undefined, reason)}
          onSnooze={
            selectedOffer
              ? (minutes) => void runSnooze(selectedOffer.id, minutes)
              : undefined
          }
          onOfferUpdated={() => refreshList(true)}
          loading={loading}
          showDetail={mobileShowDetail}
          onShowDetailChange={setMobileShowDetail}
        />
      </div>

      {/* —— Desktop: lista (decidir) + detalle —— */}
      <div className="hidden space-y-4 md:block">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className={`text-2xl font-semibold tracking-tight ${ui.title}`}>Moderación</h2>
            <p className={`mt-1 text-sm ${ui.subtitle}`}>
              Ofertas pendientes de revisión · {deskList.length} en vista
            </p>
          </div>
          <p className={`hidden text-xs lg:block ${ui.muted}`}>
            Atajos: A aprobar · R rechazar · flechas navegar
          </p>
        </header>

        <div className={`${ui.card} space-y-3 p-4`}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] max-w-sm flex-1">
              <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${ui.iconMuted}`} />
              <input
                id="moderation-search-input"
                type="search"
                placeholder="Buscar título, tienda o autor…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full py-2.5 pl-9 pr-4 text-sm ${ui.input}`}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((v) => !v)}
              className={`inline-flex items-center gap-1.5 ${ui.btnGhost}`}
              aria-expanded={showAdvancedFilters}
            >
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filtros
            </button>
          </div>

          {showAdvancedFilters ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className={`max-w-[160px] px-3 py-2.5 ${ui.select}`}
                title="Filtrar por tienda"
              >
                <option value="">Todas las tiendas</option>
                {storesInList.sort().map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className={`max-w-[140px] px-3 py-2.5 ${ui.select}`}
                title="Filtrar por categoría"
              >
                {CATEGORY_OPTIONS.map(({ value, label }) => (
                  <option key={value || 'all'} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {canAdvancedModeration ? (
                <>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className={`px-3 py-2.5 ${ui.select}`}
                    title="Desde fecha"
                  />
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className={`px-3 py-2.5 ${ui.select}`}
                    title="Hasta fecha"
                  />
                  <label className={`flex cursor-pointer items-center gap-2 text-sm ${ui.soft}`}>
                    <input
                      type="checkbox"
                      checked={riskHighOnly}
                      onChange={(e) => setRiskHighOnly(e.target.checked)}
                      className="rounded border-gray-300 text-amber-500 focus:ring-amber-500 dark:border-white/20"
                    />
                    <span>Confianza baja</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-2 text-sm ${ui.soft}`}>
                    <input
                      type="checkbox"
                      checked={vitalOnlyFilter}
                      onChange={(e) => setVitalOnlyFilter(e.target.checked)}
                      className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 dark:border-white/20"
                    />
                    <span>Solo Día a día</span>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-2 text-sm ${ui.soft}`}>
                    <input
                      type="checkbox"
                      checked={needsFixFilter}
                      onChange={(e) => setNeedsFixFilter(e.target.checked)}
                      className="rounded border-gray-300 text-violet-600 focus:ring-violet-500 dark:border-white/20"
                    />
                    <span>Sin foto / categoría</span>
                  </label>
                </>
              ) : null}
            </div>
          ) : null}

          {canAdvancedModeration && deskList.length > 0 ? (
            <div className={`flex flex-wrap items-center gap-2 border-t pt-3 ${ui.hairline}`}>
              <button
                type="button"
                onClick={toggleSelectAll}
                className={`inline-flex items-center gap-1.5 ${ui.btnGhost}`}
              >
                {selectedIds.size >= deskList.length ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                {selectedIds.size >= deskList.length ? 'Quitar todas' : 'Seleccionar'}
              </button>
              {selectedIds.size > 0 ? (
                <>
                  <span className={`text-sm ${ui.muted}`}>{selectedIds.size} sel.</span>
                  <button
                    type="button"
                    onClick={runBatchApprove}
                    disabled={batchActing}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                    title="Batch no marca verificación de enlace; revisa ofertas con URL una a una."
                  >
                    <Check className="h-4 w-4" />
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBatchReject(true)}
                    disabled={batchActing}
                    className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Rechazar
                  </button>
                  <button
                    type="button"
                    onClick={runBatchExpire}
                    disabled={batchActing}
                    className="inline-flex items-center gap-1.5 rounded-full bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                  >
                    <Clock className="h-4 w-4" />
                    Expirar
                  </button>
                </>
              ) : null}
              {botFiltered.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setDeleteBotPhrase('');
                    setDeleteBotAck(false);
                    setShowDeleteBotModal(true);
                  }}
                  className="ml-auto inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-500/20 dark:text-red-300"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Vaciar cola bot
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {showDeleteBotModal ? (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4"
            onClick={() => !deleteBotLoading && setShowDeleteBotModal(false)}
          >
            <div
              className={`w-full max-w-lg ${ui.modal} border-red-500/30 p-5`}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-1 text-lg font-semibold text-red-700 dark:text-red-200">
                Vaciar cola del bot (irreversible)
              </h3>
              <p className={`mb-3 text-sm ${ui.subtitle}`}>
                Se eliminarán las ofertas <strong className={ui.body}>pendientes</strong> del bot.
                No afecta ofertas de usuarios reales.
              </p>
              <label className={`mb-4 flex cursor-pointer items-start gap-2 text-sm ${ui.body}`}>
                <input
                  type="checkbox"
                  checked={deleteBotAck}
                  onChange={(e) => setDeleteBotAck(e.target.checked)}
                  className="mt-1 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-white/20"
                />
                <span>Entiendo que esta acción no se puede deshacer.</span>
              </label>
              <p className={`mb-1 text-xs ${ui.muted}`}>
                Escribe exactamente:{' '}
                <code className="rounded bg-black/[0.06] px-1 font-mono dark:bg-white/10">
                  {MODERATION_DELETE_BOT_CONFIRM_PHRASE}
                </code>
              </p>
              <input
                type="text"
                value={deleteBotPhrase}
                onChange={(e) => setDeleteBotPhrase(e.target.value)}
                autoComplete="off"
                placeholder="Frase de confirmación…"
                className={`mb-4 w-full px-3 py-2.5 font-mono text-sm ${ui.input}`}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => !deleteBotLoading && setShowDeleteBotModal(false)}
                  className={ui.btnGhost}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void runDeleteAllBotPending()}
                  disabled={
                    deleteBotLoading ||
                    !deleteBotAck ||
                    deleteBotPhrase.trim() !== MODERATION_DELETE_BOT_CONFIRM_PHRASE
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {deleteBotLoading ? (
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Eliminar todas (bot)
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showBatchReject ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => !batchActing && setShowBatchReject(false)}
          >
            <div
              className={`w-full max-w-md ${ui.modal} p-5`}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className={`mb-2 text-lg font-semibold ${ui.title}`}>
                Rechazar {selectedIds.size} ofertas
              </h3>
              <p className={`mb-2 text-sm ${ui.subtitle}`}>Mismo motivo para todas (obligatorio):</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {MODERATION_REJECTION_PRESETS.map((r) => (
                  <button
                    key={r.short}
                    type="button"
                    onClick={() => setBatchRejectReason(r.full)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-medium ${ui.borderStrong} ${ui.soft} hover:border-violet-400/40`}
                  >
                    {r.short}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={batchRejectReason}
                onChange={(e) => setBatchRejectReason(e.target.value)}
                placeholder="Motivo detallado…"
                className={`mb-4 w-full px-3 py-2.5 text-sm ${ui.input}`}
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBatchReject(false)}
                  className={ui.btnGhost}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={runBatchReject}
                  disabled={!batchRejectReason.trim() || batchActing}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                >
                  Rechazar
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className={`flex items-center justify-center gap-2 ${ui.emptyDash}`}>
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent"
              aria-hidden
            />
            Cargando cola…
          </div>
        ) : deskList.length === 0 ? (
          <div className={`${ui.card} p-10 text-center`}>
            <p className={`text-[15px] ${ui.subtitle}`}>
              {pending.length === 0
                ? 'No hay ofertas pendientes. Buen trabajo.'
                : 'Ninguna coincide con los filtros. Prueba a limpiar la búsqueda.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,400px)] lg:items-start lg:gap-5">
            {/* Lista decision-first (centro / izquierda) */}
            <section className="min-w-0 space-y-3">
              {!tabLocked ? (
                <div className={`flex gap-1 rounded-2xl p-1 ${ui.card}`}>
                  {(
                    [
                      { id: 'all' as const, label: 'Todas', icon: LayoutList },
                      { id: 'bot' as const, label: 'Bot', icon: Bot },
                      { id: 'users' as const, label: 'Usuarios', icon: Users },
                    ] as const
                  ).map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setSourceTab(id)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition-colors ${
                        sourceTab === id ? ui.chipActive : ui.chipIdle
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={`rounded-2xl px-3 py-2.5 text-xs font-medium ${ui.card} ${ui.soft}`}>
                  {sourceTab === 'bot' ? 'Cola del bot' : 'Cola de usuarios'}
                </div>
              )}

              <ul className="space-y-2.5">
                {deskList.map((offer) => (
                  <li key={offer.id} className="relative">
                    {canAdvancedModeration ? (
                      <button
                        type="button"
                        onClick={() => toggleSelect(offer.id)}
                        className={`absolute left-2 top-2 z-10 rounded-md p-1 ${ui.iconSoft} hover:opacity-80`}
                        aria-label="Seleccionar para lote"
                      >
                        {selectedIds.has(offer.id) ? (
                          <CheckSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    ) : null}
                    <div className={canAdvancedModeration ? 'pl-7' : undefined}>
                      <ModerationDecisionCard
                        mode={mode}
                        offer={offer}
                        active={offer.id === selectedId}
                        currentUserId={session?.user?.id ?? null}
                        linkGateOpen={linkGateId === offer.id}
                        onSelect={() => selectOffer(offer.id)}
                        onApprove={() => tryApproveFromList(offer)}
                        onReject={() => tryRejectFromList(offer)}
                        onConfirmLinkAndApprove={() => confirmLinkAndApproveFromList(offer)}
                        onDismissLinkGate={() => setLinkGateId(null)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            {/* Panel de detalle (derecha) */}
            <aside className={`sticky top-[4.5rem] min-h-0 min-w-0 overflow-hidden ${ui.card}`}>
              <div className={`flex items-center justify-between border-b px-4 py-3 ${ui.hairline}`}>
                <h3 className={`text-sm font-semibold ${ui.title}`}>Detalles de la oferta</h3>
                <span className={`text-xs tabular-nums ${ui.muted}`}>
                  {deskList.findIndex((o) => o.id === selectedId) + 1}/{deskList.length}
                </span>
              </div>
              <div className="max-h-[min(82vh,920px)] overflow-y-auto p-3">
                {selectedOffer ? (
                  <ModerationOfferDetail
                    mode={mode}
                    offer={selectedOffer}
                    similarOffers={similarOffers}
                    qualityCandidate={isQualityCandidate(selectedOffer)}
                    currentUserId={session?.user?.id ?? null}
                    linkConfirmed={linkConfirmed}
                    onLinkConfirmedChange={setLinkConfirmed}
                    actionError={actionError}
                    onClearActionError={() => setActionError(null)}
                    requestReject={requestReject}
                    onRequestRejectHandled={() => setRequestReject(false)}
                    onSnooze={(minutes) => void runSnooze(selectedOffer.id, minutes)}
                    onApprove={(id, createdBy, modMessage, offerHasUrl) => {
                      void setStatus(id, 'approved', createdBy, undefined, modMessage, offerHasUrl);
                    }}
                    onReject={(id, reason) => void setStatus(id, 'rejected', undefined, reason)}
                    onOfferUpdated={() => refreshList(true)}
                  />
                ) : (
                  <div className={`flex items-center justify-center p-10 text-sm ${ui.muted}`}>
                    Selecciona una oferta de la cola
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>

      {turnSummary ? (
        <ModerationTurnSummaryModal mode={mode} summary={turnSummary} onDismiss={dismissTurnSummary} />
      ) : null}
    </div>
  );
}
