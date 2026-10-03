'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { OwnerRangeKey } from '@/lib/owner/ownerRange';
import type { GerenciaPayload } from '@/lib/staff/buildStaffHome';
import type { AnnouncementRow, CommandData, SourceState } from './types';

/** Tras este tiempo sin refrescar, las tarjetas se marcan como stale. */
export const STALE_AFTER_MS = 10 * 60_000;

const initial = <T,>(): SourceState<T> => ({ status: 'loading', data: null, error: null, fetchedAt: null });

async function getToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && 'error' in json && typeof (json as { error: unknown }).error === 'string'
        ? (json as { error: string }).error
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

/**
 * Fuente única de datos del CEO Command Center.
 * - base: /api/admin/owner-dashboard (snapshot, no depende del rango)
 * - command: /api/admin/owner-dashboard?view=command&range=… (agregados por rango)
 * - gerencia: /api/staff/gerencia (tablero de tareas y progreso por área)
 * - announcements: /api/admin/announcements (avisos/campañas activas)
 */
export function useCommandCenter() {
  const [range, setRange] = useState<OwnerRangeKey>('today');
  const [base, setBase] = useState<SourceState<OwnerDashboardPayload>>(initial);
  const [command, setCommand] = useState<SourceState<OwnerCommandPayload>>(initial);
  const [gerencia, setGerencia] = useState<SourceState<GerenciaPayload>>(initial);
  const [announcements, setAnnouncements] = useState<SourceState<AnnouncementRow[]>>(initial);
  const [authError, setAuthError] = useState<string | null>(null);
  const rangeRef = useRef<OwnerRangeKey>('today');

  const run = useCallback(
    async <T,>(
      set: (fn: (prev: SourceState<T>) => SourceState<T>) => void,
      loader: (token: string) => Promise<T>,
      token: string,
      guard?: () => boolean,
    ) => {
      set((prev) => ({ ...prev, status: 'loading', error: null }));
      try {
        const data = await loader(token);
        if (guard && !guard()) return;
        set(() => ({ status: 'success', data, error: null, fetchedAt: Date.now() }));
      } catch (e) {
        if (guard && !guard()) return;
        set((prev) => ({ ...prev, status: 'error', error: e instanceof Error ? e.message : 'Error' }));
      }
    },
    [],
  );

  const loadCommand = useCallback(
    async (key: OwnerRangeKey, token?: string | null) => {
      const t = token ?? (await getToken());
      if (!t) return;
      await run<OwnerCommandPayload>(
        setCommand,
        (tk) => fetchJson<OwnerCommandPayload>(`/api/admin/owner-dashboard?view=command&range=${key}`, tk),
        t,
        () => rangeRef.current === key,
      );
    },
    [run],
  );

  const refreshAll = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setAuthError('Inicia sesión para ver el CEO Command Center.');
      return;
    }
    setAuthError(null);
    await Promise.all([
      run<OwnerDashboardPayload>(setBase, (tk) => fetchJson<OwnerDashboardPayload>('/api/admin/owner-dashboard', tk), token),
      loadCommand(rangeRef.current, token),
      run<GerenciaPayload>(setGerencia, (tk) => fetchJson<GerenciaPayload>('/api/staff/gerencia', tk), token),
      run<AnnouncementRow[]>(
        setAnnouncements,
        async (tk) => (await fetchJson<{ announcements: AnnouncementRow[] }>('/api/admin/announcements', tk)).announcements ?? [],
        token,
      ),
    ]);
  }, [run, loadCommand]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const changeRange = useCallback(
    (key: OwnerRangeKey) => {
      if (key === rangeRef.current) return;
      rangeRef.current = key;
      setRange(key);
      void loadCommand(key);
    },
    [loadCommand],
  );

  const data: CommandData = { base, command, gerencia, announcements };
  const refreshing = [base, command, gerencia, announcements].some((s) => s.status === 'loading');
  const fetchedTimes = [base.fetchedAt, command.fetchedAt].filter((t): t is number => t != null);
  const lastUpdated = fetchedTimes.length ? Math.min(...fetchedTimes) : null;

  return {
    range,
    changeRange,
    data,
    refreshAll,
    retryCommand: () => void loadCommand(rangeRef.current),
    refreshing,
    lastUpdated,
    authError,
  };
}
