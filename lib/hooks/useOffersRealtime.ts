'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { computeOfferScore } from '@/lib/offers/scoring';

/** Desactiva suscripción global a `offers` (menos carga; el feed se actualiza con fetch). */
export const ENABLE_OFFERS_REALTIME = false;

type OffersRealtimePayload = {
  new?: {
    id?: string;
    upvotes_count?: number | null;
    downvotes_count?: number | null;
    votes_count?: number | null;
    ranking_momentum?: number | null;
  } | null;
  old?: Record<string, unknown>;
};

type OfferWithVotes = {
  id: string;
  upvotes?: number;
  downvotes?: number;
  votes?: { up: number; down: number; score: number };
  ranking_momentum?: number | null;
};

function safeNum(v: unknown): number {
  const n = Number(v);
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0;
}

type RealtimeOptions = {
  /** Cuando cambia una fila que no está en el feed (p. ej. pasa a aprobada), pedir recarga del listado. */
  onFeedMaybeStale?: () => void;
};

export function useOffersRealtime<T extends OfferWithVotes>(
  setOffers: React.Dispatch<React.SetStateAction<T[]>>,
  options?: RealtimeOptions
) {
  const setterRef = useRef(setOffers);
  setterRef.current = setOffers;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (typeof window === 'undefined' || !ENABLE_OFFERS_REALTIME) return;

    const supabase = createClient();

    const bumpStale = () => {
      optionsRef.current?.onFeedMaybeStale?.();
    };

    const handlePayload = (payload: OffersRealtimePayload) => {
      const row = payload?.new;
      const id = row?.id;
      if (!id || typeof id !== 'string') return;

      const up = safeNum(row?.upvotes_count);
      const down = safeNum(row?.downvotes_count);
      const momentum = safeNum(row?.ranking_momentum);
      const hasMomentumCol = row?.ranking_momentum != null && row.ranking_momentum !== ('' as unknown);
      const score = hasMomentumCol ? momentum : computeOfferScore(up, down);

      setterRef.current((prev) => {
        const idx = prev.findIndex((o) => o.id === id);
        if (idx < 0) {
          bumpStale();
          return prev;
        }

        const current = prev[idx];
        const curUp = current.upvotes ?? 0;
        const curDown = current.downvotes ?? 0;
        const curMomentum = safeNum(current.ranking_momentum);
        if (curUp === up && curDown === down && curMomentum === momentum) {
          return prev;
        }

        const updated = {
          ...current,
          upvotes: up,
          downvotes: down,
          votes: { up, down, score },
          ranking_momentum: momentum,
        } as T;

        const next = [...prev];
        next[idx] = updated;
        next.sort(
          (a, b) => safeNum(b.ranking_momentum) - safeNum(a.ranking_momentum)
        );
        return next;
      });
    };

    const channel = supabase
      .channel('offers-ranking-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'offers' },
        handlePayload
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
