'use client';

import { useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { parseMultiBuyMeta, type MultiBuyMeta } from '@/lib/offers/multiBuy';
import { cn } from '@/app/components/panel/utils';

type Props = {
  mode: ModerationHubMode;
  offerId: string;
  botMeta?: unknown;
  readOnly?: boolean;
};

const STATUS_LABEL: Record<MultiBuyMeta['status'], string> = {
  pending_confirmation: 'Sin confirmar: no se publica',
  confirmed: 'Confirmada: se muestra en las condiciones',
  rejected: 'Descartada: no se publica',
};

/** Promoción 2x1/3x2 declarada por el bot. Sólo se publica si el moderador la confirma en la ficha. */
export default function MultiBuyReview({ mode, offerId, botMeta, readOnly = false }: Props) {
  const initial = parseMultiBuyMeta(botMeta);
  if (!initial) return null;
  return (
    <MultiBuyReviewForm
      key={`${offerId}:${initial.status}:${initial.effective_unit_price}`}
      mode={mode}
      offerId={offerId}
      initial={initial}
      readOnly={readOnly}
    />
  );
}

function MultiBuyReviewForm({
  mode,
  offerId,
  initial,
  readOnly,
}: {
  mode: ModerationHubMode;
  offerId: string;
  initial: MultiBuyMeta;
  readOnly: boolean;
}) {
  const ui = moderationUi(mode);
  const { session } = useAuth();
  const [meta, setMeta] = useState<MultiBuyMeta>(initial);
  const [effective, setEffective] = useState(String(initial.effective_unit_price));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const decide = async (decision: 'confirm' | 'reject') => {
    setSaving(true);
    setMessage(null);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    const res = await fetch('/api/admin/moderation/multi-buy', {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: offerId, decision, effective_unit_price: decision === 'confirm' ? effective : undefined }),
    }).catch(() => null);
    setSaving(false);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setMessage(typeof data?.error === 'string' ? data.error : 'No se pudo guardar');
      return;
    }
    const next = parseMultiBuyMeta({ multi_buy: data.multi_buy });
    if (next) {
      setMeta(next);
      setEffective(String(next.effective_unit_price));
    }
    setMessage(decision === 'confirm' ? 'Promoción confirmada' : 'Promoción descartada');
  };

  return (
    <section className={cn('rounded-xl border p-3', ui.border)} data-multi-buy-review>
      <p className={cn('text-[10px] font-semibold uppercase tracking-wider', ui.label)}>Promoción {meta.label}</p>
      <p className={cn('mt-1 text-sm', ui.body)}>
        Precio por pieza ${meta.unit_price.toLocaleString('es-MX')} · efectivo ${meta.effective_unit_price.toLocaleString('es-MX')}
      </p>
      <p className={cn('mt-0.5 text-[11px]', ui.faint)}>{STATUS_LABEL[meta.status]}. Verifica la promoción en la ficha de la tienda.</p>
      {readOnly ? null : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className={cn('text-[11px]', ui.label)} htmlFor={`multi-buy-${offerId}`}>
            Precio efectivo
          </label>
          <input
            id={`multi-buy-${offerId}`}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={effective}
            onChange={(e) => setEffective(e.target.value)}
            className={cn('w-28 rounded-lg border px-2 py-1 text-sm tabular-nums', ui.border)}
            disabled={saving}
          />
          <button
            type="button"
            onClick={() => decide('confirm')}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Confirmar
          </button>
          <button
            type="button"
            onClick={() => decide('reject')}
            disabled={saving}
            className={cn('rounded-lg px-3 py-1 text-xs font-medium disabled:opacity-50', ui.btnGhost)}
          >
            Descartar
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
