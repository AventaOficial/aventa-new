'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

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

export function useOffersRealtime<T extends OfferWithVotes>(
  setOffers: React.Dispatch<React.SetStateAction<T[]>>
) {
  const setterRef = useRef(setOffers);
  setterRef.current = setOffers;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const supabase = createClient();

    const handlePayload = (payload: OffersRealtimePayload) => {
      const row = payload?.new;
      const id = row?.id;
      if (!id || typeof id !== 'string') return;

      const up = safeNum(row?.upvotes_count);
      const down = safeNum(row?.downvotes_count);
      const score = up - down;
      const momentum = safeNum(row?.ranking_momentum);

      setterRef.current((prev) => {
        const idx = prev.findIndex((o) => o.id === id);
        if (idx < 0) return prev;

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
