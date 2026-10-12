'use client';

import { useState } from 'react';
import { Wallet } from 'lucide-react';
import {
  buildDespensaBudget,
  describeDespensaBudget,
  DESPENSA_BUDGET_HORIZON_LABELS,
  DESPENSA_BUDGET_HORIZONS,
  DESPENSA_BUDGET_LIMITS,
  DESPENSA_BUDGET_PRESETS,
  DESPENSA_BUDGET_TIER_LABELS,
  formatMxn,
  type DespensaBudget,
  type DespensaBudgetHorizon,
  type DespensaBudgetTier,
} from '@/lib/despensa/budget';
import { DESPENSA_BUDGET_COPY } from '@/lib/despensa/budgetCopy';

const PRESET_TIERS = ['low', 'medium', 'high'] as const;

const chip = (active: boolean) =>
  `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-[#1d1d1f] text-white dark:bg-[#fafafa] dark:text-[#1d1d1f]'
      : 'bg-[#e8e8ed] text-[#6e6e73] hover:bg-[#d2d2d7] dark:bg-[#2c2c2e] dark:text-[#a3a3a3] dark:hover:bg-[#3a3a3c]'
  }`;

type EditorProps = {
  initial: DespensaBudget | null;
  saving: boolean;
  onSave: (budget: DespensaBudget) => void;
  onCancel?: () => void;
  onSkip?: () => void;
  onClear?: () => void;
};

export function DespensaBudgetEditor({ initial, saving, onSave, onCancel, onSkip, onClear }: EditorProps) {
  const [horizon, setHorizon] = useState<DespensaBudgetHorizon>(initial?.horizon ?? 'monthly');
  const [tier, setTier] = useState<DespensaBudgetTier | null>(initial?.tier ?? null);
  const [custom, setCustom] = useState(initial?.tier === 'custom' ? String(initial.amountMxn) : '');
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!tier) {
      setError(DESPENSA_BUDGET_COPY.pickOne);
      return;
    }
    const amount = tier === 'custom' ? Number(custom.replace(/[^\d.]/g, '')) : null;
    const budget = buildDespensaBudget({ horizon, tier, amountMxn: amount });
    if (!budget) {
      setError(DESPENSA_BUDGET_COPY.invalidAmount);
      return;
    }
    setError(null);
    onSave(budget);
  }

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Periodo del presupuesto" className="flex gap-2">
        {DESPENSA_BUDGET_HORIZONS.map((h) => (
          <button key={h} type="button" role="radio" aria-checked={horizon === h} className={chip(horizon === h)} onClick={() => setHorizon(h)}>
            {DESPENSA_BUDGET_HORIZON_LABELS[h]}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label="Cantidad" className="flex flex-wrap gap-2">
        {PRESET_TIERS.map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tier === t} className={chip(tier === t)} onClick={() => setTier(t)}>
            {DESPENSA_BUDGET_TIER_LABELS[t]} · {formatMxn(DESPENSA_BUDGET_PRESETS[horizon][t])}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={tier === 'custom'} className={chip(tier === 'custom')} onClick={() => setTier('custom')}>
          {DESPENSA_BUDGET_TIER_LABELS.custom}
        </button>
      </div>
      {tier === 'custom' ? (
        <label className="block text-[13px] font-medium text-[#1d1d1f] dark:text-[#fafafa]">
          {DESPENSA_BUDGET_COPY.customLabel}
          <input
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={`${DESPENSA_BUDGET_LIMITS.minMxn} – ${DESPENSA_BUDGET_LIMITS.maxMxn}`}
            className="mt-1 w-full max-w-[220px] rounded-xl border border-black/10 bg-transparent px-3 py-2 text-[15px] dark:border-white/15"
            aria-describedby="despensa-budget-hint"
          />
        </label>
      ) : null}
      <p id="despensa-budget-hint" className="text-[12px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">
        {DESPENSA_BUDGET_COPY.presetsHint}
      </p>
      {error ? <p role="alert" className="text-[12px] text-rose-700 dark:text-rose-400">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        {onSkip ? (
          <button type="button" onClick={onSkip} className="text-sm font-medium text-[#6e6e73] hover:underline dark:text-[#a3a3a3]">
            Saltar
          </button>
        ) : null}
        {onCancel ? (
          <button type="button" onClick={onCancel} className="text-sm font-medium text-[#6e6e73] hover:underline dark:text-[#a3a3a3]">
            Cancelar
          </button>
        ) : null}
        {onClear ? (
          <button type="button" disabled={saving} onClick={onClear} className="text-sm font-medium text-rose-700 hover:underline dark:text-rose-400">
            Quitar presupuesto
          </button>
        ) : null}
      </div>
    </div>
  );
}

type CardProps = {
  budget: DespensaBudget | null;
  dismissed: boolean;
  saving: boolean;
  onSave: (budget: DespensaBudget | null) => Promise<boolean>;
  onDismiss: () => void;
  onReopen: () => void;
};

/** Pregunta opcional en «Día a día». Saltarla no cambia el feed. */
export function DespensaBudgetCard({ budget, dismissed, saving, onSave, onDismiss, onReopen }: CardProps) {
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);

  async function save(next: DespensaBudget | null) {
    const ok = await onSave(next);
    setFailed(!ok);
    if (ok) setEditing(false);
  }

  if (budget && !editing) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#6e6e73] dark:text-[#a3a3a3]">
        <Wallet className="h-3.5 w-3.5" aria-hidden />
        <span>
          {DESPENSA_BUDGET_COPY.activePrefix} <strong className="font-semibold text-[#1d1d1f] dark:text-[#fafafa]">{describeDespensaBudget(budget)}</strong>
        </span>
        <button type="button" onClick={() => setEditing(true)} className="font-semibold text-violet-700 hover:underline dark:text-violet-300">
          Cambiar
        </button>
      </div>
    );
  }

  if (dismissed && !editing) {
    return (
      <button
        type="button"
        onClick={() => {
          onReopen();
          setEditing(true);
        }}
        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300"
      >
        <Wallet className="h-3.5 w-3.5" aria-hidden />
        {DESPENSA_BUDGET_COPY.reopen}
      </button>
    );
  }

  return (
    <section
      aria-labelledby="despensa-budget-title"
      className="mt-3 rounded-2xl border border-[#e5e5e7] bg-white p-4 dark:border-[#262626] dark:bg-[#141414]"
    >
      <h2 id="despensa-budget-title" className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
        {DESPENSA_BUDGET_COPY.question}
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{DESPENSA_BUDGET_COPY.support}</p>
      <div className="mt-3">
        <DespensaBudgetEditor
          key={budget?.updatedAt ?? 'new'}
          initial={budget}
          saving={saving}
          onSave={(b) => void save(b)}
          onSkip={budget ? undefined : () => { setEditing(false); onDismiss(); }}
          onCancel={budget ? () => setEditing(false) : undefined}
          onClear={budget ? () => void save(null) : undefined}
        />
      </div>
      {failed ? <p role="alert" className="mt-2 text-[12px] text-rose-700 dark:text-rose-400">{DESPENSA_BUDGET_COPY.saveFailed}</p> : null}
    </section>
  );
}
