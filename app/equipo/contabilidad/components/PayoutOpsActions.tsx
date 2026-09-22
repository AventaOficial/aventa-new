'use client';

import { useCallback, useRef, useState } from 'react';
import { CheckCircle2, Download, FileUp, Loader2, Lock, PackageCheck, Send, XCircle } from 'lucide-react';
import StatusBadge from '@/app/components/panel/StatusBadge';
import { cn } from '@/app/components/panel/utils';
import { centsToMx } from '@/lib/finance/hubConfig';
import type { PayoutBatchWithLines } from '@/lib/finance/payoutOps/batches';
import type { AutoReleaseSummary, BatchPreview } from '@/lib/finance/payoutOps/types';

const card =
  'rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.03] p-4';
const btn =
  'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed';
const btnPrimary = cn(btn, 'bg-amber-500 text-white hover:bg-amber-600');
const btnGhost = cn(
  btn,
  'border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5',
);

const BATCH_STATUS_LABEL: Record<PayoutBatchWithLines['status'], string> = {
  draft: 'Borrador',
  approved: 'Aprobado',
  released: 'Liberado',
  cancelled: 'Cancelado',
};
const BATCH_STATUS_TONE: Record<PayoutBatchWithLines['status'], 'ok' | 'attention' | 'critical' | 'neutral'> = {
  draft: 'attention',
  approved: 'ok',
  released: 'ok',
  cancelled: 'neutral',
};

const BLOCKER_LABEL: Record<string, string> = {
  auto_release_disabled: 'PAYOUT_AUTO_RELEASE_ENABLED apagado',
  money_path_frozen: 'money path congelado',
  rewards_program_off: 'programa de recompensas OFF',
  provider_not_real: 'sin proveedor SPEI real',
  ingest_evidence_missing: 'sin evidencia de red del periodo',
  no_payable_lines: 'sin líneas pagables',
  review_pending: 'hay líneas en revisión',
};

type EvidenceResponse = {
  ok: true;
  type: 'earnings' | 'orders';
  summary: {
    rows: number;
    feesCents: number;
    negativeFeesCents: number;
    revenueCents: number;
    withTracking: number;
    trackingIds: string[];
    returns: number;
  };
  skipped: number;
  warnings: string[];
  applied: {
    dryRun: boolean;
    conversionsCreated: number;
    conversionsReused: number;
    commissionsCreated: number;
    commissionsReused: number;
    revisionsNeeded: number;
    failed: number;
    attributedRows: number;
    unattributedRows: number;
    creatorsMatched: number;
    errors: string[];
  };
};

type Props = {
  headers: () => Record<string, string>;
  role: string;
  viewerId: string | null;
  batch: BatchPreview;
  batches: PayoutBatchWithLines[];
  batchesTableAvailable: boolean;
  autoRelease: AutoReleaseSummary;
  onChanged: () => void;
};

export function EvidenceImportCard({ headers, onChanged }: Pick<Props, 'headers' | 'onChanged'>) {
  const [csv, setCsv] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState<'preview' | 'commit' | null>(null);
  const [result, setResult] = useState<EvidenceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onFile = useCallback((f: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ''));
      setResult(null);
      setError(null);
      if (!label) setLabel(f.name);
    };
    reader.readAsText(f, 'utf-8');
  }, [label]);

  const run = useCallback(
    async (commit: boolean) => {
      setBusy(commit ? 'commit' : 'preview');
      setError(null);
      try {
        const res = await fetch('/api/staff/finance/payout-ops/evidence/amazon', {
          method: 'POST',
          headers: { ...headers(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ csv, commit, label: label || null }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(typeof body?.error === 'string' ? body.error : 'No se pudo procesar');
          setResult(null);
          return;
        }
        setResult(body as EvidenceResponse);
        if (commit) onChanged();
      } catch {
        setError('Error de red');
      } finally {
        setBusy(null);
      }
    },
    [csv, label, headers, onChanged],
  );

  const s = result?.summary;
  const a = result?.applied;

  return (
    <section className={cn(card, 'space-y-3')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Evidencia Amazon (caja 1: Entra)</h2>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Descarga <span className="font-medium">Earnings</span> (comisiones confirmadas) u{' '}
            <span className="font-medium">Orders</span> (pedidos) de Amazon Associates MX como CSV y pégalo o súbelo.
            Primero previsualiza; nada se escribe hasta confirmar. Se guardan como conversiones/comisiones con
            huella idempotente — no mueve dinero.
          </p>
        </div>
        <FileUp className="h-4 w-4 text-amber-600 shrink-0" />
      </div>

      <div className="grid sm:grid-cols-[1fr_auto] gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Etiqueta (ej. earnings-2026-09.csv)"
          className="rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-xs"
        />
        <button type="button" className={btnGhost} onClick={() => fileRef.current?.click()}>
          <FileUp className="h-3.5 w-3.5" />
          Subir CSV
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <textarea
        value={csv}
        onChange={(e) => {
          setCsv(e.target.value);
          setResult(null);
        }}
        rows={5}
        placeholder="Category,Name,ASIN,Seller,Tracking ID,Date Shipped,Price($),Items Shipped,Returns,Revenue($),Ad Fees($)…"
        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-xs font-mono"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btnGhost} disabled={!csv.trim() || busy !== null} onClick={() => void run(false)}>
          {busy === 'preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Previsualizar
        </button>
        <button
          type="button"
          className={btnPrimary}
          disabled={!result || result.applied.dryRun === false || busy !== null}
          onClick={() => void run(true)}
        >
          {busy === 'commit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Confirmar importación
        </button>
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {result && s && a ? (
        <div className="rounded-xl bg-gray-50 dark:bg-white/5 p-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral">Reporte: {result.type === 'earnings' ? 'Earnings' : 'Orders'}</StatusBadge>
            <StatusBadge tone={a.dryRun ? 'attention' : 'ok'}>{a.dryRun ? 'Previsualización' : 'Importado'}</StatusBadge>
            <span className="text-gray-600 dark:text-gray-400">
              {s.rows} filas · {result.skipped} omitidas · {s.returns} devoluciones
            </span>
          </div>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <dt className="text-gray-500">Comisión total</dt>
              <dd className="font-semibold tabular-nums">{centsToMx(s.feesCents)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Ventas</dt>
              <dd className="font-semibold tabular-nums">{centsToMx(s.revenueCents)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Con tracking</dt>
              <dd className="font-semibold tabular-nums">
                {s.withTracking}/{s.rows} · {a.creatorsMatched} creador(es)
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">{a.dryRun ? 'Se crearían' : 'Creadas / reusadas'}</dt>
              <dd className="font-semibold tabular-nums">
                {a.conversionsCreated} conv · {a.commissionsCreated} com
                {a.dryRun ? '' : ` · ${a.conversionsReused + a.commissionsReused} reusadas`}
              </dd>
            </div>
          </dl>
          {a.revisionsNeeded > 0 ? (
            <p className="text-amber-700 dark:text-amber-400">
              {a.revisionsNeeded} fila(s) con devolución/comisión negativa: se registran como revisión manual (no se
              crean comisiones negativas automáticamente).
            </p>
          ) : null}
          {result.warnings.map((w) => (
            <p key={w} className="text-amber-700 dark:text-amber-400">
              {w}
            </p>
          ))}
          {a.errors.slice(0, 5).map((e) => (
            <p key={e} className="text-red-600">
              {e}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function BatchesCard({
  headers,
  role,
  viewerId,
  batch,
  batches,
  batchesTableAvailable,
  autoRelease,
  onChanged,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [notes, setNotes] = useState('');

  const call = useCallback(
    async (key: string, url: string, init: RequestInit) => {
      setBusy(key);
      setMsg(null);
      try {
        const res = await fetch(url, { ...init, headers: { ...headers(), 'Content-Type': 'application/json' } });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMsg({ tone: 'err', text: typeof body?.error === 'string' ? body.error : 'Operación fallida' });
          return;
        }
        if (body?.summary) {
          const su = body.summary as Record<string, number>;
          setMsg({
            tone: 'ok',
            text: `Liberación: ${su.reserved} reservadas · ${su.reused} reusadas · ${su.deferred} diferidas · ${su.rejected} rechazadas.`,
          });
        } else {
          setMsg({ tone: 'ok', text: 'Listo.' });
        }
        onChanged();
      } catch {
        setMsg({ tone: 'err', text: 'Error de red' });
      } finally {
        setBusy(null);
      }
    },
    [headers, onChanged],
  );

  const active = batches.find((b) => b.status === 'draft' || b.status === 'approved') ?? null;
  const canPrepare = batchesTableAvailable && !active && batch.lines.length > 0;

  return (
    <section className={cn(card, 'space-y-4')}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Lotes (caja 4: Junta) y liberación</h2>
          <p className="text-xs text-gray-600 dark:text-gray-400 max-w-2xl">
            Preparar congela la foto de quién cobra. Aprobar exige una segunda persona (el owner puede forzar y queda
            registrado). Liberar reserva intents por recompensa; en producción congelada todo sale{' '}
            <span className="font-medium">diferido</span> y el lote sigue aprobado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <a
            href="/api/staff/finance/payout-ops/export?kind=batch"
            className={btnGhost}
            onClick={(e) => {
              e.preventDefault();
              void downloadCsv('/api/staff/finance/payout-ops/export?kind=batch', headers(), `lote-${batch.periodLabel}.csv`);
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Lote CSV
          </a>
          <a
            href={`/api/staff/finance/payout-ops/export?kind=paid&period=${batch.periodLabel}`}
            className={btnGhost}
            onClick={(e) => {
              e.preventDefault();
              void downloadCsv(
                `/api/staff/finance/payout-ops/export?kind=paid&period=${batch.periodLabel}`,
                headers(),
                `pagados-${batch.periodLabel}.csv`,
              );
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Pagados CSV
          </a>
        </div>
      </div>

      {!batchesTableAvailable ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Falta aplicar la migración <code>20260922_payout_batches_v3.sql</code> para persistir lotes.
        </p>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Nota del lote (opcional)"
          className="flex-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-xs"
        />
        <button
          type="button"
          className={btnPrimary}
          disabled={!canPrepare || busy !== null}
          title={active ? `Ya hay un lote ${BATCH_STATUS_LABEL[active.status].toLowerCase()} para este periodo` : undefined}
          onClick={() =>
            void call('prepare', '/api/staff/finance/payout-ops/batches', {
              method: 'POST',
              body: JSON.stringify({ notes: notes || null }),
            })
          }
        >
          {busy === 'prepare' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
          Preparar lote {batch.periodLabel}
        </button>
      </div>

      {msg ? (
        <p className={cn('text-xs', msg.tone === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600')}>{msg.text}</p>
      ) : null}

      {batches.length === 0 ? (
        <p className="text-sm text-gray-500">Aún no hay lotes. El primero se prepara cuando haya saldos disponibles.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {batches.map((b) => {
            const isPreparer = viewerId && b.prepared_by === viewerId;
            const passLines = b.lines.filter((l) => l.decision === 'pass');
            return (
              <li key={b.id} className="py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={BATCH_STATUS_TONE[b.status]}>{BATCH_STATUS_LABEL[b.status]}</StatusBadge>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{b.period_key}</span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {centsToMx(b.payable_cents)} · {b.payable_count} pagables · {b.review_count} revisar · {b.blocked_count}{' '}
                    bloqueados · {b.carry_count} acumulan
                  </span>
                  {b.meta?.self_approved === true ? <StatusBadge tone="attention">auto-aprobado (owner)</StatusBadge> : null}
                </div>
                <p className="text-[11px] text-gray-500">
                  Preparado {new Date(b.prepared_at).toLocaleString('es-MX')} por {b.prepared_by?.slice(0, 8) ?? '—'}
                  {b.approved_at ? ` · aprobado ${new Date(b.approved_at).toLocaleString('es-MX')} por ${b.approved_by?.slice(0, 8)}` : ''}
                  {b.released_at ? ` · liberado ${new Date(b.released_at).toLocaleString('es-MX')}` : ''}
                  {b.notes ? ` · "${b.notes}"` : ''}
                </p>
                {b.status === 'draft' || b.status === 'approved' ? (
                  <div className="flex flex-wrap gap-2">
                    {b.status === 'draft' ? (
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={busy !== null || (Boolean(isPreparer) && role !== 'owner')}
                        title={isPreparer ? 'Tú preparaste este lote: regla de dos personas' : undefined}
                        onClick={() =>
                          void call(`approve:${b.id}`, `/api/staff/finance/payout-ops/batches/${b.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ action: 'approve', force: Boolean(isPreparer && role === 'owner') }),
                          })
                        }
                      >
                        {busy === `approve:${b.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        {isPreparer && role === 'owner' ? 'Aprobar (forzar, owner)' : 'Aprobar'}
                      </button>
                    ) : null}
                    {b.status === 'approved' && role === 'owner' ? (
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={busy !== null || passLines.length === 0}
                        onClick={() => {
                          if (!window.confirm(`Liberar ${passLines.length} línea(s) pagables del lote ${b.period_key}? Reserva intents (no ejecuta SPEI).`)) return;
                          void call(`release:${b.id}`, `/api/staff/finance/payout-ops/batches/${b.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ action: 'release' }),
                          });
                        }}
                      >
                        {busy === `release:${b.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        Liberar líneas pagables
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={btnGhost}
                      disabled={busy !== null}
                      onClick={() => {
                        const reason = window.prompt('Motivo de cancelación (opcional)') ?? '';
                        void call(`cancel:${b.id}`, `/api/staff/finance/payout-ops/batches/${b.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ action: 'cancel', reason }),
                        });
                      }}
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Cancelar
                    </button>
                  </div>
                ) : null}
                {b.lines.length > 0 ? (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-600 dark:text-gray-400">{b.lines.length} línea(s)</summary>
                    <ul className="mt-1.5 space-y-1">
                      {b.lines.map((l) => (
                        <li key={l.id} className="flex flex-wrap items-center gap-2">
                          <span className="text-gray-900 dark:text-gray-100">{l.display_name ?? l.creator_id.slice(0, 8)}</span>
                          <span className="tabular-nums font-medium">{centsToMx(l.amount_cents)}</span>
                          <span className="text-gray-500">{l.decision}</span>
                          {l.release_status !== 'none' ? <StatusBadge tone={l.release_status === 'rejected' ? 'critical' : l.release_status === 'deferred' ? 'attention' : 'ok'}>{l.release_status}</StatusBadge> : null}
                          {l.gate_reasons.length > 0 ? <span className="text-gray-500">{l.gate_reasons.join(' ')}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-3 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-gray-500" />
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">Auto-release (V5)</p>
          <StatusBadge tone={autoRelease.eligible ? 'ok' : 'neutral'}>
            {autoRelease.eligible ? 'Se auto-liberaría' : `Bloqueado (${autoRelease.blockers.length})`}
          </StatusBadge>
        </div>
        {autoRelease.blockers.length > 0 ? (
          <p className="text-[11px] text-gray-600 dark:text-gray-400">
            {autoRelease.blockers.map((b) => BLOCKER_LABEL[b] ?? b).join(' · ')}
          </p>
        ) : null}
        <ul className="text-[11px] text-gray-500 list-disc pl-4 space-y-0.5">
          {autoRelease.policy.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

async function downloadCsv(url: string, headers: Record<string, string>, filename: string) {
  try {
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  } catch {
    /* noop */
  }
}
