'use client';

import { useState } from 'react';
import { FOCUS_REJECTION_PRESETS } from '@/lib/moderation/rejectionPresets';
import { useAuth } from '@/app/providers/AuthProvider';
import { useUI } from '@/app/providers/UIProvider';

type Props = {
  offerId: string;
  onRemoved: () => void;
};

export default function FeedModerationAction({ offerId, onRemoved }: Props) {
  const { session } = useAuth();
  const { showToast } = useUI();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(FOCUS_REJECTION_PRESETS[0]?.full ?? '');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!session?.access_token || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/moderate-offer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: offerId,
          status: 'rejected',
          reason,
          surface: 'feed',
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast?.(typeof body?.error === 'string' ? body.error : 'No se pudo retirar la oferta.');
        return;
      }
      setOpen(false);
      onRemoved();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-1" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-rose-600 dark:text-rose-300"
      >
        Moderar
      </button>
      {open ? (
        <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-500/30 dark:bg-rose-950/30">
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">Retirar del feed</p>
          <p className="mt-1 text-[11px] text-gray-600 dark:text-gray-300">
            La oferta deja de ser pública. No se borra.
          </p>
          <label className="mt-2 block text-[11px] text-gray-500 dark:text-gray-400">
            Motivo
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-white/10 dark:bg-[#141414] dark:text-gray-100"
            >
              {FOCUS_REJECTION_PRESETS.map((preset) => (
                <option key={preset.short} value={preset.full}>
                  {preset.short}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs dark:border-white/10"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={sending || !reason}
              onClick={() => void submit()}
              className="flex-1 rounded-lg bg-rose-600 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {sending ? 'Retirando…' : 'Retirar'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
