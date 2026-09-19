'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { canAccessUsersLogs, pickEffectiveRole, type Role } from '@/lib/admin/roles';

type OpsFilter = 'all' | 'publishing' | 'unknown_outcome' | 'retryable' | 'published';

type OpsRow = {
  id: string;
  offerId: string;
  destinationId: string;
  provider: string | null;
  status: string;
  operatorStatus: string;
  attemptCount: number;
  idempotencyKey: string;
  distributionVersion: number;
  externalMessageId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  lease: {
    owner: string | null;
    acquiredAt: string | null;
    expiresAt: string | null;
  } | null;
  lastEvent: {
    eventType: string;
    createdAt: string;
    meta: Record<string, unknown>;
  } | null;
  requiresOperatorReconcile: boolean;
};

const FILTERS: { id: OpsFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'publishing', label: 'Publishing' },
  { id: 'unknown_outcome', label: 'Unknown outcome' },
  { id: 'retryable', label: 'Retryable' },
  { id: 'published', label: 'Published' },
];

function statusTone(status: string): string {
  switch (status) {
    case 'unknown_outcome':
      return 'bg-amber-500/15 text-amber-200 border-amber-500/30';
    case 'publishing':
      return 'bg-sky-500/15 text-sky-200 border-sky-500/30';
    case 'retryable':
      return 'bg-violet-500/15 text-violet-200 border-violet-500/30';
    case 'published':
      return 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30';
    default:
      return 'bg-white/10 text-white/70 border-white/15';
  }
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

export default function DistributionOpsPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [roleOk, setRoleOk] = useState(false);
  const [filter, setFilter] = useState<OpsFilter>('all');
  const [rows, setRows] = useState<OpsRow[]>([]);
  const [engineEnabled, setEngineEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) {
      router.replace('/login');
      return;
    }
    const supabase = createClient();
    void (async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id);
      const role = pickEffectiveRole(
        ((roles ?? []) as { role: Role }[]).map((r) => r.role),
      );
      if (!canAccessUsersLogs(role)) {
        router.replace('/admin');
        return;
      }
      setRoleOk(true);
    })();
  }, [session, router]);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/distribution-ops?status=${encodeURIComponent(filter)}&limit=50`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setRows([]);
        return;
      }
      setRows(json.publications ?? []);
      setEngineEnabled(Boolean(json.engineEnabled));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load_failed');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, filter]);

  useEffect(() => {
    if (roleOk) void load();
  }, [roleOk, load]);

  async function releaseToRetryable(row: OpsRow) {
    if (!session?.access_token) return;
    const ok = window.confirm(
      `¿Liberar publication ${row.id} de UNKNOWN_OUTCOME → retryable?\n\nSolo si confirmaste que el side-effect externo NO ocurrió.\nNo publica. No llama Telegram.`,
    );
    if (!ok) return;

    setBusyId(row.id);
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/distribution-ops', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          action: 'release_unknown_to_retryable',
          publicationId: row.id,
          reason: 'ops_ui_confirmed_not_published',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setActionMsg(
          `Release falló: ${json.reason ?? res.status}` +
            (json.currentStatus ? ` (status actual: ${json.currentStatus})` : ''),
        );
        await load();
        return;
      }
      setActionMsg(
        `OK: ${json.publicationId} → retryable (idempotency preserved: ${json.idempotencyKey ?? '—'})`,
      );
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'release_failed');
    } finally {
      setBusyId(null);
    }
  }

  if (!roleOk) {
    return (
      <div className="p-8 text-sm text-white/50">Verificando acceso…</div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 text-white">
      <header className="mb-8 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/35">
          Distribution C3
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Distribution Operations</h1>
        <p className="max-w-2xl text-sm text-white/50">
          Inspección y recuperación de publicaciones atascadas. No publica. No llama
          providers. Release UNKNOWN → retryable es la única mutación permitida.
        </p>
        <p className="text-xs text-white/40">
          Engine flag:{' '}
          <span className={engineEnabled ? 'text-amber-300' : 'text-emerald-300'}>
            {engineEnabled ? 'ON' : 'OFF'}
          </span>
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              filter === f.id
                ? 'border-violet-400/40 bg-violet-500/20 text-violet-100'
                : 'border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.06]'
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/50 hover:bg-white/[0.06]"
        >
          Refresh
        </button>
      </div>

      {actionMsg ? (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/80">
          {actionMsg}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-white/40">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/40">Sin publicaciones para este filtro.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusTone(row.status)}`}
                    >
                      {row.operatorStatus}
                    </span>
                    <span className="font-mono text-xs text-white/60">{shortId(row.id)}</span>
                  </div>
                  <p className="text-xs text-white/45">
                    offer {shortId(row.offerId)} · dest {shortId(row.destinationId)} · v
                    {row.distributionVersion}
                    {row.provider ? ` · ${row.provider}` : ''}
                  </p>
                </div>
                <div className="text-right text-[11px] text-white/40">
                  <div>attempt {row.attemptCount}</div>
                  <div>updated {row.updatedAt}</div>
                </div>
              </div>

              <dl className="mt-3 grid gap-2 text-[11px] text-white/50 sm:grid-cols-2">
                <div>
                  <dt className="text-white/30">Idempotency</dt>
                  <dd className="break-all font-mono text-white/70">{row.idempotencyKey}</dd>
                </div>
                <div>
                  <dt className="text-white/30">Lease</dt>
                  <dd>
                    {row.lease
                      ? `${row.lease.owner ?? '—'} · ${row.lease.acquiredAt ?? '—'} → ${row.lease.expiresAt ?? '—'}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-white/30">External message</dt>
                  <dd className="font-mono">{row.externalMessageId ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-white/30">Last event</dt>
                  <dd>
                    {row.lastEvent
                      ? `${row.lastEvent.eventType} @ ${row.lastEvent.createdAt}`
                      : '—'}
                  </dd>
                </div>
                {(row.lastErrorCode || row.lastErrorMessage) && (
                  <div className="sm:col-span-2">
                    <dt className="text-white/30">Error</dt>
                    <dd>
                      {row.lastErrorCode ?? '—'}
                      {row.lastErrorMessage ? ` — ${row.lastErrorMessage}` : ''}
                    </dd>
                  </div>
                )}
              </dl>

              {row.requiresOperatorReconcile ? (
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-3">
                  <p className="flex-1 text-sm text-amber-100">
                    Requiere reconciliación del operador
                  </p>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void releaseToRetryable(row)}
                    className="rounded-lg bg-amber-400/90 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                  >
                    {busyId === row.id ? 'Releasing…' : 'Release to retryable'}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
