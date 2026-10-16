'use client';

import { useEffect, useState } from 'react';
import type { EquipoContextResponse } from '@/lib/staff/equipoContextTypes';

export function useEquipoContext(): {
  ctx: EquipoContextResponse | null;
  ready: boolean;
} {
  const [ctx, setCtx] = useState<EquipoContextResponse | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch('/api/equipo/context', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          setCtx(null);
          return;
        }
        setCtx((await res.json()) as EquipoContextResponse);
      })
      .catch(() => setCtx(null))
      .finally(() => setReady(true));
  }, []);

  return { ctx, ready };
}
