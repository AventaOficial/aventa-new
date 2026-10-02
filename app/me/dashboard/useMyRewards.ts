'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type MyRewardRow = {
  id: string;
  uiStatus: 'validating' | 'available' | 'delivered' | 'cancelled' | 'synthetic';
  statusLabel: string;
  isSynthetic?: boolean;
};

export type MyRewardsState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; rows: MyRewardRow[] };

export type RewardGoal = {
  programName: string;
  approvedOffers: number;
  requiredOffers: number;
  positiveVotes: number;
  requiredVotes: number;
  unlocked: boolean;
};

export type RewardGoalState = { goal: RewardGoal | null; pending: boolean };

async function fetchMeJson<T>(path: string): Promise<{ ok: boolean; body: T } | null> {
  const supabase = createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return null;
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const body = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, body };
}

export function useMyRewards(): MyRewardsState {
  const [state, setState] = useState<MyRewardsState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await fetchMeJson<{ rewards?: MyRewardRow[] }>('/api/me/rewards');
        if (!result || !result.ok) {
          if (active) setState({ kind: 'error' });
          return;
        }
        if (active) setState({ kind: 'ready', rows: result.body.rewards ?? [] });
      } catch {
        if (active) setState({ kind: 'error' });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return state;
}

/** Progreso hacia la próxima recompensa; solo se consulta en pantallas < 640 px. */
export function useRewardGoal(): RewardGoalState {
  const [narrow, setNarrow] = useState(false);
  const [goal, setGoal] = useState<RewardGoal | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!narrow) return;
    let live = true;
    setPending(true);
    (async () => {
      try {
        const result = await fetchMeJson<{ programName?: string; progress?: RewardGoal }>('/api/me/rewards/status');
        const progress = result?.ok ? result.body.progress : undefined;
        if (!live || !progress) return;
        setGoal({
          programName: result?.body.programName?.trim() || 'Recompensa de bienvenida',
          approvedOffers: progress.approvedOffers ?? 0,
          requiredOffers: progress.requiredOffers ?? 0,
          positiveVotes: progress.positiveVotes ?? 0,
          requiredVotes: progress.requiredVotes ?? 0,
          unlocked: Boolean(progress.unlocked),
        });
      } catch {
        if (live) setGoal(null);
      } finally {
        if (live) setPending(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [narrow]);

  return { goal: narrow ? goal : null, pending: narrow && pending };
}
