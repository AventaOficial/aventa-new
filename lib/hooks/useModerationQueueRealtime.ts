'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

type LockPatch = {
  id: string;
  locked_by?: string | null;
  locked_at?: string | null;
  snoozed_until?: string | null;
};

type Options = {
  enabled?: boolean;
  onOfferPatch: (patch: LockPatch) => void;
};

/**
 * Escucha cambios de lock/snooze en ofertas pending (colaboración entre moderadores).
 */
export function useModerationQueueRealtime({ enabled = true, onOfferPatch }: Options) {
  const patchRef = useRef(onOfferPatch);
  patchRef.current = onOfferPatch;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const supabase = createClient();
    const channel = supabase
      .channel('moderation-queue-locks')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'offers', filter: 'status=eq.pending' },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          const id = typeof row?.id === 'string' ? row.id : null;
          if (!id) return;
          patchRef.current({
            id,
            locked_by: (row?.locked_by as string | null | undefined) ?? null,
            locked_at: (row?.locked_at as string | null | undefined) ?? null,
            snoozed_until: (row?.snoozed_until as string | null | undefined) ?? null,
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled]);
}
