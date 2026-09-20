'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import GlassCard from '@/app/components/panel/GlassCard';
import SectionHeader from '@/app/components/panel/SectionHeader';
import StatusBadge from '@/app/components/panel/StatusBadge';
import KpiCard from '@/app/components/panel/KpiCard';
import {
  LAB_PRIMARY_LABELS,
  derivePipelineStages,
  displayOrNd,
  type LabCandidateRow,
  type LabLabelCounters,
  type LabMetricsPrep,
  type LabPipelineStage,
  type LabReconciliation,
} from '@/lib/hunter/candidateIntelligence/labReview';

type LabRun = {
  run_id: string;
  started_at: string;
  finished_at: string;
  candidate_count: number;
  rejected_count: number;
  needs_review_count: number;
  would_insert_count: number;
  inserted_pending_count: number;
  published_count: number;
  duplicate_count: number;
  rejection_breakdown?: Record<string, number>;
  decision_breakdown?: Record<string, number>;
  sources?: string[];
  retailers?: string[];
  mode?: string;
};

type FilterOptions = {
  sources: string[];
  retailers: string[];
  decisions: string[];
  reasonCodes: string[];
  stages: string[];
};

const TARGET_RUN_ID = '229de9f1-3364-4f9a-9175-7b97c1567997';

const PRIMARY_BUTTONS: Array<{
  decision: (typeof LAB_PRIMARY_LABELS)[keyof typeof LAB_PRIMARY_LABELS];
  label: string;
  className: string;
}> = [
  {
    decision: LAB_PRIMARY_LABELS.GOOD,
    label: '🔥 BUENA OFERTA',
    className: 'bg-emerald-600 text-white hover:bg-emerald-500',
  },
  {
    decision: LAB_PRIMARY_LABELS.BAD,
    label: '❌ NO ES OFERTA',
    className: 'bg-rose-700 text-white hover:bg-rose-600',
  },
  {
    decision: LAB_PRIMARY_LABELS.UNCERTAIN,
    label: '⚠️ DUDA',
    className: 'bg-amber-600 text-white hover:bg-amber-500',
  },
  {
    decision: LAB_PRIMARY_LABELS.FALSE_NEGATIVE,
    label: '🚨 AVENTA LA PERDIÓ',
    className: 'bg-orange-700 text-white hover:bg-orange-600',
  },
];

async function authHeaders(): Promise<HeadersInit> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

function nd(v: unknown): string {
  return displayOrNd(v);
}

function money(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return 'N/D';
  return `$${Number(v).toLocaleString('es-MX')}`;
}

function stageTone(status: LabPipelineStage['status']): 'ok' | 'critical' | 'attention' | 'neutral' {
  if (status === 'PASS') return 'ok';
  if (status === 'FAIL') return 'critical';
  if (status === 'SKIPPED') return 'neutral';
  return 'attention';
}

const emptyCounters: LabLabelCounters = {
  total: 0,
  reviewed: 0,
  pending: 0,
  buenas: 0,
  malas: 0,
  duda: 0,
  falseNegative: 0,
  falsePositive: 0,
  fnRate: null,
  fnRateDisplay: 'N/D — insuficientes labels',
  fnRateNote: '',
};

export default function HunterLabPanel() {
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LabCandidateRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [counters, setCounters] = useState<LabLabelCounters>(emptyCounters);
  const [reconciliation, setReconciliation] = useState<LabReconciliation | null>(null);
  const [metrics, setMetrics] = useState<LabMetricsPrep | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    sources: [],
    retailers: [],
    decisions: [],
    reasonCodes: [],
    stages: [],
  });

  const [source, setSource] = useState('');
  const [retailer, setRetailer] = useState('');
  const [decision, setDecision] = useState('');
  const [reasonCode, setReasonCode] = useState('');
  const [stage, setStage] = useState('');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [humanLabel, setHumanLabel] = useState('');
  const [unreviewedOnly, setUnreviewedOnly] = useState(true);
  const [titleSearch, setTitleSearch] = useState('');
  const [missedView, setMissedView] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [labelMsg, setLabelMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<LabCandidateRow | null>(null);
  const [runInput, setRunInput] = useState(TARGET_RUN_ID);

  const pipeline = useMemo(
    () => (selected ? derivePipelineStages(selected) : []),
    [selected],
  );

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/hunter-lab', { headers: await authHeaders() });
      const data = await res.json();
      if (!data.ok && data.error) {
        setError(data.error);
        setRuns([]);
      } else {
        setRuns(Array.isArray(data.runs) ? data.runs : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando runs');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCandidates = useCallback(
    async (runId: string, pageNum = 1, opts?: { missed?: boolean }) => {
      setSelectedRunId(runId);
      setRunInput(runId);
      setLoadingCandidates(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          run_id: runId,
          page: String(pageNum),
          page_size: String(pageSize),
        });
        if (source) qs.set('source', source);
        if (retailer) qs.set('retailer', retailer);
        if (decision) qs.set('decision', decision);
        if (reasonCode) qs.set('reason_code', reasonCode);
        if (stage) qs.set('stage', stage);
        if (scoreMin) qs.set('score_min', scoreMin);
        if (scoreMax) qs.set('score_max', scoreMax);
        if (humanLabel) qs.set('human_label', humanLabel);
        if (titleSearch) qs.set('q', titleSearch);
        if (opts?.missed ?? missedView) qs.set('missed', '1');
        else if (unreviewedOnly) qs.set('unreviewed_only', '1');

        const res = await fetch(`/api/admin/hunter-lab?${qs}`, {
          headers: await authHeaders(),
        });
        const data = await res.json();
        if (data.error) setError(data.error);
        setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
        setTotal(typeof data.total === 'number' ? data.total : 0);
        setPage(typeof data.page === 'number' ? data.page : pageNum);
        if (data.counters) setCounters(data.counters);
        if (data.reconciliation) setReconciliation(data.reconciliation);
        if (data.metrics) setMetrics(data.metrics);
        if (data.filter_options) setFilterOptions(data.filter_options);
        setSelected(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error cargando candidatos');
      } finally {
        setLoadingCandidates(false);
      }
    },
    [
      pageSize,
      source,
      retailer,
      decision,
      reasonCode,
      stage,
      scoreMin,
      scoreMax,
      humanLabel,
      titleSearch,
      missedView,
      unreviewedOnly,
    ],
  );

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('run_id')?.trim();
    if (fromUrl) {
      setRunInput(fromUrl);
      void loadCandidates(fromUrl, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo bootstrap URL
  }, []);

  const submitLabel = async (
    human: string,
    candidate: LabCandidateRow | null = selected,
  ) => {
    if (!candidate) return;
    setLabelMsg(null);
    try {
      const res = await fetch('/api/admin/hunter-lab/label', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          candidate_id: candidate.id,
          hunter_decision: candidate.decision,
          human_decision: human,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setLabelMsg(data.error || 'No se pudo etiquetar');
        return;
      }
      setLabelMsg(`Etiqueta ${human} → ${data.outcome} (no publica)`);
      setCandidates((prev) =>
        prev.map((c) =>
          c.id === candidate.id
            ? {
                ...c,
                human_label: human,
                human_reviewed_at: data.label?.reviewed_at ?? new Date().toISOString(),
                label_outcome: data.outcome ?? null,
              }
            : c,
        ),
      );
      if (selected?.id === candidate.id) {
        setSelected((s) =>
          s
            ? {
                ...s,
                human_label: human,
                human_reviewed_at: data.label?.reviewed_at ?? new Date().toISOString(),
                label_outcome: data.outcome ?? null,
              }
            : s,
        );
      }
      if (selectedRunId) {
        void loadCandidates(selectedRunId, page);
      }
    } catch (e) {
      setLabelMsg(e instanceof Error ? e.message : 'Error');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <GlassCard className="space-y-4">
      <SectionHeader
        title="Hunter Lab — Production Review"
        subtitle="Revisión humana masiva de candidatos reales. Observation only · Discovery ≠ Publication · No auto-publish."
      />
      {error ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {error}. Si la tabla no existe, aplica `20260920_hunter_candidate_intelligence*.sql` en staging.
        </p>
      ) : null}
      {loading ? <p className="text-sm text-gray-500">Cargando runs…</p> : null}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
        <div className="min-w-[280px] flex-1">
          <label className="text-[10px] uppercase tracking-wide text-white/40">run_id</label>
          <input
            value={runInput}
            onChange={(e) => setRunInput(e.target.value)}
            className="mt-1 w-full rounded-md border border-white/15 bg-black/30 px-2 py-1.5 font-mono text-xs text-white/90"
            placeholder={TARGET_RUN_ID}
          />
        </div>
        <button
          type="button"
          className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white"
          onClick={() => void loadCandidates(runInput.trim() || TARGET_RUN_ID, 1)}
        >
          Abrir run
        </button>
        <button
          type="button"
          className="rounded-md border border-white/20 px-3 py-1.5 text-xs text-white/80"
          onClick={() => {
            setMissedView(false);
            setUnreviewedOnly(true);
            void loadCandidates(TARGET_RUN_ID, 1, { missed: false });
          }}
        >
          Run producción
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="text-gray-500">
            <tr>
              <th className="py-1 pr-2">Run</th>
              <th className="py-1 pr-2">Inicio</th>
              <th className="py-1 pr-2">N</th>
              <th className="py-1 pr-2">Rech.</th>
              <th className="py-1 pr-2">Review</th>
              <th className="py-1 pr-2">Would</th>
              <th className="py-1 pr-2">Dup</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr
                key={r.run_id}
                className={`cursor-pointer border-t border-gray-100 dark:border-gray-800 ${
                  selectedRunId === r.run_id ? 'bg-violet-50/60 dark:bg-violet-950/30' : ''
                }`}
                onClick={() => {
                  setMissedView(false);
                  void loadCandidates(r.run_id, 1);
                }}
              >
                <td className="py-1.5 pr-2 font-mono text-[10px]" title={r.run_id}>
                  {r.run_id}
                </td>
                <td className="py-1.5 pr-2">{new Date(r.started_at).toLocaleString('es-MX')}</td>
                <td className="py-1.5 pr-2 tabular-nums">{r.candidate_count}</td>
                <td className="py-1.5 pr-2 tabular-nums">{r.rejected_count}</td>
                <td className="py-1.5 pr-2 tabular-nums">{r.needs_review_count}</td>
                <td className="py-1.5 pr-2 tabular-nums">{r.would_insert_count}</td>
                <td className="py-1.5 pr-2 tabular-nums">{r.duplicate_count}</td>
              </tr>
            ))}
            {!loading && runs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-3 text-gray-500">
                  Sin runs todavía. El worker ml_worker persistirá aquí en observation mode.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedRunId ? (
        <div className="space-y-4 border-t border-gray-100 pt-3 dark:border-gray-800">
          {/* Reconciliation — FACT */}
          {reconciliation ? (
            <div
              className={`rounded-lg border p-3 text-xs ${
                reconciliation.hasGap
                  ? 'border-rose-500/50 bg-rose-950/40 text-rose-100'
                  : 'border-white/10 bg-black/20 text-white/70'
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                Run reconciliation · FACT
              </p>
              <div className="mt-2 flex flex-wrap gap-3 tabular-nums">
                <span>discovered={reconciliation.discovered}</span>
                <span>persisted={reconciliation.persisted}</span>
                <span>decision_sum={reconciliation.decisionSum}</span>
                <span>gap_persisted={reconciliation.gapDiscoveredPersisted}</span>
                <span>gap_silent={reconciliation.gapSilentDrops}</span>
              </div>
              {reconciliation.hasGap ? (
                <p className="mt-2 font-medium text-rose-200">
                  ⚠ GAP detectado — no ocultar. Revisar silent drops / persistencia.
                </p>
              ) : (
                <p className="mt-2 text-emerald-300/80">Sin gap discovered↔persisted / silent drops.</p>
              )}
              {Object.keys(reconciliation.decisionTotals).length > 0 ? (
                <p className="mt-2 break-all text-white/45">
                  decisions:{' '}
                  {Object.entries(reconciliation.decisionTotals)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(' · ')}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Counters */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            <KpiCard label="TOTAL (FACT)" value={String(counters.total)} />
            <KpiCard label="REVISADAS (LABEL)" value={String(counters.reviewed)} />
            <KpiCard label="PENDIENTES" value={String(counters.pending)} />
            <KpiCard label="BUENAS (LABEL)" value={String(counters.buenas)} />
            <KpiCard label="MALAS (LABEL)" value={String(counters.malas)} />
            <KpiCard label="DUDA (LABEL)" value={String(counters.duda)} />
            <KpiCard label="FALSE NEG (LABEL)" value={String(counters.falseNegative)} />
            <KpiCard label="FN RATE (DERIVED)" value={counters.fnRateDisplay} />
          </div>
          {counters.fnRateNote ? (
            <p className="text-[10px] text-white/35">{counters.fnRateNote}</p>
          ) : null}

          {/* Metrics prep */}
          {metrics ? (
            <div className="rounded-lg border border-white/10 bg-black/15 p-3 text-[11px] text-white/60">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                Metrics prep · FACT / LABEL / DERIVED
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <span>discovery[{metrics.discovery.kind}]={nd(metrics.discovery.value)}</span>
                <span>persisted[{metrics.persisted.kind}]={metrics.persisted.value}</span>
                <span>would_insert[{metrics.wouldInsert.kind}]={metrics.wouldInsert.value}</span>
                <span>rejected[{metrics.rejected.kind}]={metrics.rejected.value}</span>
                <span>needs_review[{metrics.needsReview.kind}]={metrics.needsReview.value}</span>
                <span>good[{metrics.humanGood.kind}]={metrics.humanGood.value}</span>
                <span>bad[{metrics.humanBad.kind}]={metrics.humanBad.value}</span>
                <span>FN[{metrics.humanFn.kind}]={metrics.humanFn.value}</span>
                <span>FP[{metrics.humanFp.kind}]={metrics.humanFp.value}</span>
                <span>
                  precision≈[{metrics.precisionApprox.kind}]={metrics.precisionApprox.display}
                </span>
                <span>coverage[{metrics.coverage.kind}]={metrics.coverage.display}</span>
              </div>
            </div>
          ) : null}

          {/* Filters */}
          <div className="flex flex-wrap items-end gap-2">
            <FilterSelect
              label="source"
              value={source}
              onChange={setSource}
              options={filterOptions.sources}
            />
            <FilterSelect
              label="retailer"
              value={retailer}
              onChange={setRetailer}
              options={filterOptions.retailers}
            />
            <FilterSelect
              label="decision"
              value={decision}
              onChange={setDecision}
              options={filterOptions.decisions}
            />
            <FilterSelect
              label="reason"
              value={reasonCode}
              onChange={setReasonCode}
              options={filterOptions.reasonCodes}
            />
            <FilterSelect
              label="stage"
              value={stage}
              onChange={setStage}
              options={filterOptions.stages}
            />
            <div>
              <label className="text-[10px] text-white/40">score min</label>
              <input
                value={scoreMin}
                onChange={(e) => setScoreMin(e.target.value)}
                className="mt-0.5 w-16 rounded border border-white/15 bg-black/30 px-1 py-1 text-xs"
              />
            </div>
            <div>
              <label className="text-[10px] text-white/40">score max</label>
              <input
                value={scoreMax}
                onChange={(e) => setScoreMax(e.target.value)}
                className="mt-0.5 w-16 rounded border border-white/15 bg-black/30 px-1 py-1 text-xs"
              />
            </div>
            <FilterSelect
              label="human label"
              value={humanLabel}
              onChange={setHumanLabel}
              options={[
                'GOOD_DEAL',
                'BAD_DEAL',
                'UNCERTAIN',
                'FALSE_NEGATIVE',
                'FALSE_POSITIVE',
                'REJECT',
                'OTHER',
              ]}
            />
            <div>
              <label className="text-[10px] text-white/40">título</label>
              <input
                value={titleSearch}
                onChange={(e) => setTitleSearch(e.target.value)}
                className="mt-0.5 w-36 rounded border border-white/15 bg-black/30 px-1 py-1 text-xs"
                placeholder="buscar…"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-white/70">
              <input
                type="checkbox"
                checked={unreviewedOnly && !missedView}
                onChange={(e) => {
                  setUnreviewedOnly(e.target.checked);
                  if (e.target.checked) setMissedView(false);
                }}
              />
              Solo no revisadas
            </label>
            <button
              type="button"
              className="rounded-md bg-violet-600 px-2 py-1 text-xs text-white"
              onClick={() => {
                setMissedView(false);
                void loadCandidates(selectedRunId, 1, { missed: false });
              }}
            >
              Aplicar
            </button>
            <button
              type="button"
              className={`rounded-md px-2 py-1 text-xs ${
                missedView
                  ? 'bg-orange-600 text-white'
                  : 'border border-orange-500/40 text-orange-200'
              }`}
              onClick={() => {
                setMissedView(true);
                setUnreviewedOnly(false);
                void loadCandidates(selectedRunId, 1, { missed: true });
              }}
            >
              Missed opportunities (FN)
            </button>
            <StatusBadge tone="neutral">
              {loadingCandidates ? '…' : `${total} en filtro · pág ${page}/${totalPages}`}
            </StatusBadge>
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
            {/* Table */}
            <div className="max-h-[640px] overflow-auto rounded-lg border border-gray-100 dark:border-gray-800">
              <table className="min-w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-white dark:bg-[#0b0b0b] text-gray-500">
                  <tr>
                    <th className="p-1">Img</th>
                    <th className="p-1">Producto / store</th>
                    <th className="p-1">$</th>
                    <th className="p-1">prev</th>
                    <th className="p-1">%</th>
                    <th className="p-1">Score</th>
                    <th className="p-1">Decision</th>
                    <th className="p-1">Reason</th>
                    <th className="p-1">Label</th>
                    <th className="p-1">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr
                      key={c.id}
                      className={`border-t border-gray-50 dark:border-gray-900 ${
                        selected?.id === c.id ? 'bg-violet-50 dark:bg-violet-950/40' : ''
                      }`}
                    >
                      <td className="p-1 cursor-pointer" onClick={() => setSelected(c)}>
                        {c.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.image_url} alt="" className="h-10 w-10 object-contain" />
                        ) : (
                          <span className="text-gray-400">N/D</span>
                        )}
                      </td>
                      <td
                        className="max-w-[180px] cursor-pointer p-1"
                        onClick={() => setSelected(c)}
                      >
                        <p className="truncate font-medium">{nd(c.title)}</p>
                        <p className="truncate text-[10px] text-gray-500">
                          {nd(c.retailer)} · {nd(c.source)}
                        </p>
                      </td>
                      <td className="p-1 tabular-nums">{money(c.sale_price)}</td>
                      <td className="p-1 tabular-nums">{money(c.original_price)}</td>
                      <td className="p-1 tabular-nums">
                        {c.discount_percentage != null ? `${c.discount_percentage}%` : 'N/D'}
                      </td>
                      <td className="p-1 tabular-nums">{nd(c.hunter_score)}</td>
                      <td className="p-1 font-mono text-[10px]">{c.decision}</td>
                      <td className="max-w-[90px] truncate p-1 font-mono text-[10px]">
                        {nd(c.reason_code)}
                      </td>
                      <td className="p-1 font-mono text-[10px]">{nd(c.human_label)}</td>
                      <td className="p-1">
                        <div className="flex flex-col gap-0.5">
                          {PRIMARY_BUTTONS.map((b) => (
                            <button
                              key={b.decision}
                              type="button"
                              className={`rounded px-1 py-0.5 text-[9px] leading-tight ${b.className}`}
                              onClick={() => void submitLabel(b.decision, c)}
                            >
                              {b.label}
                            </button>
                          ))}
                          {c.decision === 'WOULD_INSERT' ? (
                            <button
                              type="button"
                              className="rounded border border-white/20 px-1 py-0.5 text-[9px] text-white/70"
                              onClick={() => void submitLabel('FALSE_POSITIVE', c)}
                            >
                              FP
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loadingCandidates && candidates.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-4 text-gray-500">
                        Sin candidatos para este filtro.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Detail */}
            <div className="space-y-2 rounded-lg border border-gray-100 p-3 text-xs dark:border-gray-800">
              {selected ? (
                <>
                  <p className="text-sm font-semibold">{nd(selected.title)}</p>
                  {selected.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selected.image_url}
                      alt=""
                      className="mx-auto max-h-40 object-contain"
                    />
                  ) : (
                    <p className="text-gray-500">Imagen N/D</p>
                  )}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-[11px]">
                    <dt className="text-gray-500">candidate_id</dt>
                    <dd className="break-all font-mono">{selected.id}</dd>
                    <dt className="text-gray-500">run_id</dt>
                    <dd className="break-all font-mono">{selected.run_id}</dd>
                    <dt className="text-gray-500">discovered_at</dt>
                    <dd>{new Date(selected.discovered_at).toLocaleString('es-MX')}</dd>
                    <dt className="text-gray-500">source / retailer</dt>
                    <dd>
                      {nd(selected.source)} / {nd(selected.retailer)}
                    </dd>
                    <dt className="text-gray-500">product_url</dt>
                    <dd className="break-all">
                      <a
                        href={selected.canonical_url || selected.source_url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="text-violet-300 underline"
                      >
                        {nd(selected.canonical_url || selected.source_url)}
                      </a>
                    </dd>
                    <dt className="text-gray-500">current / previous</dt>
                    <dd>
                      {money(selected.sale_price)} / {money(selected.original_price)}
                    </dd>
                    <dt className="text-gray-500">discount / rating / reviews</dt>
                    <dd>
                      {selected.discount_percentage != null
                        ? `${selected.discount_percentage}%`
                        : 'N/D'}{' '}
                      / {nd(selected.product_rating)} / {nd(selected.review_count)}
                    </dd>
                    <dt className="text-gray-500">score / decision</dt>
                    <dd>
                      {nd(selected.hunter_score)} · {selected.decision} · {nd(selected.reason_code)} @{' '}
                      {nd(selected.rejection_stage)}
                    </dd>
                    <dt className="text-gray-500">brand / category</dt>
                    <dd>
                      {nd(selected.brand)} / {nd(selected.category)}
                    </dd>
                    <dt className="text-gray-500">identity</dt>
                    <dd className="break-all font-mono text-[10px]">
                      fp={nd(selected.product_fingerprint)} · id=
                      {nd(selected.product_identifier)}
                    </dd>
                    <dt className="text-gray-500">image validation</dt>
                    <dd>
                      {nd(selected.image_validation_status)} ·{' '}
                      {nd(selected.image_validation_reason)}
                    </dd>
                    <dt className="text-gray-500">human label</dt>
                    <dd>
                      {nd(selected.human_label)} ({nd(selected.label_outcome)})
                    </dd>
                  </dl>

                  {Array.isArray(selected.score_explanation) &&
                  selected.score_explanation.length > 0 ? (
                    <div>
                      <p className="text-[10px] uppercase text-gray-500">Score breakdown</p>
                      <ul className="list-inside list-disc text-gray-600 dark:text-gray-300">
                        {selected.score_explanation.map((s) => (
                          <li key={s.signal}>
                            {s.signal}: {s.points > 0 ? '+' : ''}
                            {s.points}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-gray-500">Score breakdown N/D</p>
                  )}

                  <div>
                    <p className="mb-1 text-[10px] uppercase text-gray-500">
                      Pipeline (best-effort desde persistido)
                    </p>
                    <ol className="space-y-1">
                      {pipeline.map((s) => (
                        <li key={s.stage} className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] text-white/70">{s.stage}</span>
                          <StatusBadge tone={stageTone(s.status)}>{s.status}</StatusBadge>
                          <span className="text-[10px] text-white/40">{nd(s.reason)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {PRIMARY_BUTTONS.map((b) => (
                      <button
                        key={b.decision}
                        type="button"
                        onClick={() => void submitLabel(b.decision)}
                        className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${b.className}`}
                      >
                        {b.label}
                      </button>
                    ))}
                    {selected.decision === 'WOULD_INSERT' ? (
                      <button
                        type="button"
                        onClick={() => void submitLabel('FALSE_POSITIVE')}
                        className="rounded-md border border-white/25 px-2.5 py-1.5 text-xs text-white/80"
                      >
                        FALSE_POSITIVE
                      </button>
                    ) : null}
                  </div>
                  {labelMsg ? (
                    <p className="text-violet-600 dark:text-violet-300">{labelMsg}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-gray-500">
                  Selecciona un candidato para ver detalle y pipeline. Etiqueta desde la tabla o aquí.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={page <= 1 || loadingCandidates}
              className="rounded border border-white/20 px-3 py-1 text-xs disabled:opacity-40"
              onClick={() => void loadCandidates(selectedRunId, page - 1)}
            >
              ← Anterior
            </button>
            <span className="text-xs text-white/50">
              Página {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loadingCandidates}
              className="rounded border border-white/20 px-3 py-1 text-xs disabled:opacity-40"
              onClick={() => void loadCandidates(selectedRunId, page + 1)}
            >
              Siguiente →
            </button>
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="text-[10px] text-white/40">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 block max-w-[140px] rounded border border-white/15 bg-black/30 px-1 py-1 text-xs"
      >
        <option value="">(todos)</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
