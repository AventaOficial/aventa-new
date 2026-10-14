'use client';

import { useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { cn } from '@/app/components/panel/utils';
import { hunterByCode, supplyHunterOptions } from '@/lib/product/hunters/identity';
import { hunterLaneMismatch, offerLaneCode } from '@/lib/product/hunters/lane';

type Props = {
  mode: ModerationHubMode;
  offerId: string;
  botMeta?: unknown;
  title?: string | null;
  category?: string | null;
  readOnly?: boolean;
  /** Tras guardar: el padre actualiza `bot_meta.hunter_code` para que el autor mostrado cambie. */
  onSaved?: (hunterCode: string) => void;
};

/** Oferta de un cliente MCP: la ingesta deja price_policy o enrichment en bot_meta. */
function machineMeta(botMeta: unknown): Record<string, unknown> | null {
  if (!botMeta || typeof botMeta !== 'object' || Array.isArray(botMeta)) return null;
  const meta = botMeta as Record<string, unknown>;
  return 'price_policy' in meta || 'enrichment' in meta || 'hunter_code' in meta ? meta : null;
}

/** Qué hunter presenta la oferta del bot. Avisa si el producto no corresponde a su especialidad. */
export default function HunterLaneReview({ mode, offerId, botMeta, title, category, readOnly = false, onSaved }: Props) {
  const meta = machineMeta(botMeta);
  if (!meta) return null;
  const initial = offerLaneCode(typeof meta.hunter_code === 'string' ? meta.hunter_code : null);
  return (
    <HunterLaneForm
      key={offerId}
      mode={mode}
      offerId={offerId}
      initial={initial}
      title={title ?? null}
      category={category ?? null}
      readOnly={readOnly}
      onSaved={onSaved}
    />
  );
}

function HunterLaneForm({
  mode,
  offerId,
  initial,
  title,
  category,
  readOnly,
  onSaved,
}: {
  mode: ModerationHubMode;
  offerId: string;
  initial: string;
  title: string | null;
  category: string | null;
  readOnly: boolean;
  onSaved?: (hunterCode: string) => void;
}) {
  const ui = moderationUi(mode);
  const { session } = useAuth();
  const [current, setCurrent] = useState(initial);
  const [choice, setChoice] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [syncedInitial, setSyncedInitial] = useState(initial);
  if (initial !== syncedInitial) {
    setSyncedInitial(initial);
    setCurrent(initial);
    setChoice(initial);
  }

  const hunter = hunterByCode(current);
  const mismatch = hunterLaneMismatch({ hunterCode: current, title, category });
  const suggested = mismatch ? hunterByCode(mismatch.suggested) : null;

  const save = async (code: string) => {
    setSaving(true);
    setMessage(null);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch('/api/admin/moderation/offer-hunter', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: offerId, hunterCode: code }),
    }).catch(() => null);
    setSaving(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setMessage(typeof data?.error === 'string' ? data.error : 'No se pudo guardar');
      return;
    }
    setCurrent(code);
    setChoice(code);
    setMessage(`Ahora la presenta ${hunterByCode(code)?.displayName ?? code}`);
    onSaved?.(code);
  };

  return (
    <section
      className={cn('rounded-xl border p-3', mismatch ? 'border-amber-500/60 bg-amber-500/5' : ui.border)}
      data-hunter-lane-review
    >
      <p className={cn('text-[10px] font-semibold uppercase tracking-wider', ui.label)}>Hunter de la oferta</p>
      <p className={cn('mt-1 text-sm', ui.body)}>
        {hunter?.displayName ?? current}
        {hunter ? <span className={cn('ml-1 text-[11px]', ui.faint)}>· {hunter.specialty}</span> : null}
      </p>
      {mismatch && suggested ? (
        <p className="mt-1 text-[12px] font-medium text-amber-700 dark:text-amber-300" role="alert">
          No parece de su especialidad: por título y categoría corresponde a {suggested.displayName}.
        </p>
      ) : null}
      {readOnly ? null : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {mismatch && suggested ? (
            <button
              type="button"
              onClick={() => save(mismatch.suggested)}
              disabled={saving}
              className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
            >
              Pasar a {suggested.name}
            </button>
          ) : null}
          <label className={cn('text-[11px]', ui.label)} htmlFor={`hunter-lane-${offerId}`}>
            Cambiar a
          </label>
          <select
            id={`hunter-lane-${offerId}`}
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            disabled={saving}
            className={cn('rounded-lg border px-2 py-1 text-xs', ui.border)}
          >
            {supplyHunterOptions().map((option) => (
              <option key={option.code} value={option.code}>
                {option.displayName}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => save(choice)}
            disabled={saving || choice === current}
            className={cn('rounded-lg px-3 py-1 text-xs font-medium disabled:opacity-50', ui.btnGhost)}
          >
            Guardar
          </button>
        </div>
      )}
      {message ? (
        <p className={cn('mt-1 text-[11px]', ui.muted)} role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
