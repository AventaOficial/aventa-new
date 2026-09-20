'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import GlassCard from '@/app/components/panel/GlassCard';
import SectionHeader from '@/app/components/panel/SectionHeader';
import StatusBadge from '@/app/components/panel/StatusBadge';

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

type LabCandidate = {
  id: string;
  run_id: string;
  title: string | null;
  retailer: string | null;
  source: string;
  sale_price: number | null;
  original_price: number | null;
  discount_percentage: number | null;
  hunter_score: number | null;
  decision: string;
  reason_code: string;
  reason_detail: string | null;
  rejection_stage: string;
  canonical_url: string;
  image_url: string | null;
  image_validation_status: string | null;
  diversity_cut: boolean | null;
  negative_memory_level: string | null;
  score_explanation: Array<{ signal: string; points: number }> | null;
  discovered_at: string;
};

const LABEL_ACTIONS = [
  'GOOD_DEAL',
  'BAD_DEAL',
  'FALSE_NEGATIVE',
  'FALSE_POSITIVE',
  'DUPLICATE',
  'WRONG_IMAGE',
  'BROKEN_LINK',
  'BAD_PRICE',
  'BAD_DISCOUNT',
  'OTHER',
] as const;

async function authHeaders(): Promise<HeadersInit> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export default function HunterLabPanel() {
  const [runs, setRuns] = useState<LabRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<LabCandidate[]>([]);
  const [decisionFilter, setDecisionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [labelMsg, setLabelMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<LabCandidate | null>(null);

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

  const loadCandidates = useCallback(async (runId: string, decision?: string) => {
    setSelectedRunId(runId);
    setSelected(null);
    try {
      const qs = new URLSearchParams({ run_id: runId, limit: '100' });
      if (decision) qs.set('decision', decision);
      const res = await fetch(`/api/admin/hunter-lab?${qs}`, { headers: await authHeaders() });
      const data = await res.json();
      setCandidates(Array.isArray(data.candidates) ? data.candidates : []);
      if (data.error) setError(data.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando candidatos');
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const submitLabel = async (human: (typeof LABEL_ACTIONS)[number]) => {
    if (!selected) return;
    setLabelMsg(null);
    try {
      const res = await fetch('/api/admin/hunter-lab/label', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          candidate_id: selected.id,
          hunter_decision: selected.decision,
          human_decision: human,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        setLabelMsg(data.error || 'No se pudo etiquetar');
        return;
      }
      setLabelMsg(`Etiqueta ${human} → ${data.outcome} (no publica)`);
    } catch (e) {
      setLabelMsg(e instanceof Error ? e.message : 'Error');
    }
  };

  return (
    <GlassCard className="space-y-4">
      <SectionHeader
        title="Hunter Lab — Candidate Intelligence"
        subtitle="Observación candidato a candidato. Discovery ≠ Publication. No publica automáticamente."
      />
      {error ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {error}. Si la tabla no existe, aplica `20260920_hunter_candidate_intelligence*.sql` en staging.
        </p>
      ) : null}
      {loading ? <p className="text-sm text-gray-500">Cargando runs…</p> : null}

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
                onClick={() => void loadCandidates(r.run_id, decisionFilter || undefined)}
              >
                <td className="py-1.5 pr-2 font-mono text-[10px]">{r.run_id.slice(0, 8)}…</td>
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
        <div className="space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-500">Filtrar decision</label>
            <input
              value={decisionFilter}
              onChange={(e) => setDecisionFilter(e.target.value)}
              placeholder="REJECTED_SCORE"
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-[#111]"
            />
            <button
              type="button"
              className="rounded-md bg-violet-600 px-2 py-1 text-xs text-white"
              onClick={() => void loadCandidates(selectedRunId, decisionFilter || undefined)}
            >
              Aplicar
            </button>
            <StatusBadge tone="neutral">{candidates.length} candidatos</StatusBadge>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="max-h-[420px] overflow-auto rounded-lg border border-gray-100 dark:border-gray-800">
              <table className="min-w-full text-left text-[11px]">
                <thead className="sticky top-0 bg-white dark:bg-[#0b0b0b] text-gray-500">
                  <tr>
                    <th className="p-1">Img</th>
                    <th className="p-1">Producto</th>
                    <th className="p-1">$</th>
                    <th className="p-1">%</th>
                    <th className="p-1">Score</th>
                    <th className="p-1">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr
                      key={c.id}
                      className={`cursor-pointer border-t border-gray-50 dark:border-gray-900 ${
                        selected?.id === c.id ? 'bg-violet-50 dark:bg-violet-950/40' : ''
                      }`}
                      onClick={() => setSelected(c)}
                    >
                      <td className="p-1">
                        {c.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.image_url} alt="" className="h-8 w-8 object-contain" />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="max-w-[140px] truncate p-1">{c.title || '—'}</td>
                      <td className="p-1 tabular-nums">{c.sale_price ?? '—'}</td>
                      <td className="p-1 tabular-nums">{c.discount_percentage ?? '—'}</td>
                      <td className="p-1 tabular-nums">{c.hunter_score ?? '—'}</td>
                      <td className="p-1 font-mono text-[10px]">{c.decision}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 rounded-lg border border-gray-100 p-3 text-xs dark:border-gray-800">
              {selected ? (
                <>
                  <p className="font-semibold text-sm">{selected.title || 'Sin título'}</p>
                  {selected.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={selected.image_url}
                      alt=""
                      className="mx-auto max-h-40 object-contain"
                    />
                  ) : null}
                  <p>
                    <span className="text-gray-500">Decision:</span> {selected.decision} /{' '}
                    {selected.reason_code} @ {selected.rejection_stage}
                  </p>
                  <p>
                    <span className="text-gray-500">Image:</span>{' '}
                    {selected.image_validation_status || '—'}
                  </p>
                  <p className="break-all">
                    <span className="text-gray-500">URL:</span> {selected.canonical_url}
                  </p>
                  {Array.isArray(selected.score_explanation) && selected.score_explanation.length > 0 ? (
                    <ul className="list-inside list-disc text-gray-600 dark:text-gray-300">
                      {selected.score_explanation.map((s) => (
                        <li key={s.signal}>
                          {s.signal}: {s.points > 0 ? '+' : ''}
                          {s.points}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {LABEL_ACTIONS.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => void submitLabel(a)}
                        className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900"
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                  {labelMsg ? <p className="text-violet-600 dark:text-violet-300">{labelMsg}</p> : null}
                </>
              ) : (
                <p className="text-gray-500">Selecciona un candidato para revisar y etiquetar.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}
