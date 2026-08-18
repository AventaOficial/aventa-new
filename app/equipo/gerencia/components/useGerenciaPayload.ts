'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import type { GerenciaPayload } from '@/lib/staff/buildStaffHome';

export function useGerenciaPayload() {
  const { session } = useAuth();
  const [data, setData] = useState<GerenciaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback((): Record<string, string> => {
    const h: Record<string, string> = {};
    if (session?.access_token) h.Authorization = `Bearer ${session.access_token}`;
    return h;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/staff/gerencia', { headers: headers() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'Sin acceso');
        return;
      }
      setData(body as GerenciaPayload);
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    if (session?.access_token) void load();
    else setLoading(false);
  }, [session?.access_token, load]);

  return { data, loading, error, reload: load };
}
