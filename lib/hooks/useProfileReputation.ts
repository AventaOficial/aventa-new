'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import {
  readCachedProfileReputation,
  writeCachedProfileReputation,
  type ProfileReputation,
} from '@/lib/profileReputation';

export function useProfileReputation(): {
  level: number;
  score: number;
  /** False until the first fetch for this session user finishes (cache still shows immediately). */
  ready: boolean;
} {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [rep, setRep] = useState<ProfileReputation>(() => {
    if (!userId) return { level: 1, score: 0 };
    return readCachedProfileReputation(userId) ?? { level: 1, score: 0 };
  });
  const [ready, setReady] = useState(!userId);

  useEffect(() => {
    if (!userId) {
      setRep({ level: 1, score: 0 });
      setReady(true);
      return;
    }
    const cached = readCachedProfileReputation(userId);
    if (cached) setRep(cached);
    setReady(false);
    const supabase = createClient();
    supabase
      .from('profiles')
      .select('reputation_level, reputation_score')
      .eq('id', userId)
      .maybeSingle()
      .then(
        ({ data }) => {
          const next: ProfileReputation = {
            level: Math.max(1, (data as { reputation_level?: number } | null)?.reputation_level ?? 1),
            score: Math.max(0, (data as { reputation_score?: number } | null)?.reputation_score ?? 0),
          };
          setRep(next);
          writeCachedProfileReputation(userId, next);
          setReady(true);
        },
        () => setReady(true),
      );
  }, [userId]);

  return { level: rep.level, score: rep.score, ready };
}
