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

export function useMyRewards(): MyRewardsState {
  const [state, setState] = useState<MyRewardsState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          if (active) setState({ kind: 'error' });
          return;
        }
        const res = await fetch('/api/me/rewards', { headers: { Authorization: `Bearer ${token}` } });
        const body = (await res.json().catch(() => ({}))) as { rewards?: MyRewardRow[] };
        if (!res.ok) {
          if (active) setState({ kind: 'error' });
          return;
        }
        if (active) setState({ kind: 'ready', rows: body.rewards ?? [] });
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
