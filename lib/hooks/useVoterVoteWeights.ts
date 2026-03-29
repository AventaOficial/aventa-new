'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { clampReputationLevel, voteWeightPairForLevel } from '@/lib/votes/reputationWeights';

/** Pesos de voto del usuario con sesión (para optimismo en UI). */
export function useVoterVoteWeights(): { up: number; down: number; level: 1 | 2 | 3 | 4 } {
  const { user } = useAuth();
  const [level, setLevel] = useState<1 | 2 | 3 | 4>(1);

  useEffect(() => {
    if (!user?.id) {
      setLevel(1);
      return;
    }
    const supabase = createClient();
    void (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('reputation_level')
          .eq('id', user.id)
          .maybeSingle();
        setLevel(clampReputationLevel((data as { reputation_level?: number } | null)?.reputation_level));
      } catch {
        setLevel(1);
      }
    })();
  }, [user?.id]);

  const { up, down } = voteWeightPairForLevel(level);
  return { up, down, level };
}
