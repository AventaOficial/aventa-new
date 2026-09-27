'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { moderationUi } from '@/app/admin/moderation/moderationUi';
import { ACQUISITION_MAX_URLS } from '@/lib/acquisition/contract';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { cn } from '@/app/components/panel/utils';

type SourceRow = {
  id: string;
  source_key: string;
  source_type: string;
  display_name: string;
  active: boolean;
};

type ScoutRow = {
  id: string;
  display_name: string;
  source_id: string;
};

type SubmitItem = {
  raw: string;
  outcome: string;
  url: string | null;
};

type AdvanceResult = {
  ok: boolean;
  error: string | null;
  forwarded: number;
  remaining: number;
  ready: number;
  needsReview: number;
  errored: number;
  skipped: Array<{ reason: string }>;
};

type SubmitResult = {
  received: number;
  accepted: number;
  duplicates: number;
  invalid: number;
  overCap: number;
  idempotent: number;
  submissionId: string;
  items: SubmitItem[];
  persistError?: string | null;
  advance: AdvanceResult | null;
};

export default function AcquisitionIntake({ mode }: { mode: ModerationHubMode }) {
  const ui = moderationUi(mode);
  const { session } = useAuth();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [scouts, setScouts] = useState<ScoutRow[]>([]);
  const [sourceKey, setSourceKey] = useState('human_scout');
  const [scoutId, setScoutId] = useState('');
  const [scoutName, setScoutName] = useState('');
  const [externalRunId, setExternalRunId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const sessionRef = useRef({ signature: '', id: '' });

  const source = sources.find((row) => row.source_key === sourceKey);
  const needsScout = source?.source_type === 'human';

  const headers = useCallback((): Record<string, string> | null => {
    const token = session?.access_token;
    if (!token) {
      setBanner('Inicia sesión para entregar candidatos.');
      return null;
    }
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }, [session?.access_token]);

  const loadSources = useCallback(async () => {
    const h = headers();
    if (!h) return;
    const res = await fetch('/api/admin/acquisition/sources', { headers: h, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.sources)) setSources(data.sources.filter((row: SourceRow) => row.active));
  }, [headers]);

  const loadScouts = useCallback(async () => {
    const h = headers();
    if (!h || !needsScout) {
      setScouts([]);
      return;
    }
    const res = await fetch(`/api/admin/acquisition/scouts?source=${encodeURIComponent(sourceKey)}`, {
      headers: h,
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.scouts)) setScouts(data.scouts);
  }, [headers, needsScout, sourceKey]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    void loadScouts();
  }, [loadScouts]);

  async function createScout() {
    const h = headers();
    if (!h) return;
    setBusy('scout');
    setBanner(null);
    try {
      const res = await fetch('/api/admin/acquisition/scouts', {
        method: 'POST',
        headers: h,
        body: JSON.stringify({ sourceKey, displayName: scoutName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner(data.error || 'No se pudo registrar el scout.');
        return;
      }
      setScoutName('');
      if (data.scout?.id) setScoutId(data.scout.id);
      await loadScouts();
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    const h = headers();
    if (!h) return;
    setBusy('submit');
    setBanner(null);
    setResult(null);
    const signature = `${sourceKey}\0${needsScout ? scoutId : ''}\0${text}`;
    if (sessionRef.current.signature !== signature) {
      sessionRef.current = {
        signature,
        id: externalRunId.trim() || crypto.randomUUID(),
      };
    }
    const runId = externalRunId.trim() || sessionRef.current.id;
    try {
      const res = await fetch('/api/admin/acquisition/submit', {
        method: 'POST',
        headers: h,
        body: JSON.stringify({
          sourceKey,
          scoutId: needsScout ? scoutId : null,
          externalRunId: runId,
          text,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner(data.error || 'No se pudo registrar el envío.');
        return;
      }
      setResult(data);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <div>
        <h1 className={cn('text-xl font-semibold', ui.title)}>Enviar oferta</h1>
        <p className={cn('mt-1 text-sm', ui.subtitle)}>
          Copia la URL, pégala y envía. Hasta {ACQUISITION_MAX_URLS}. No se publica sola.
        </p>
      </div>

      <div className={cn('flex flex-col gap-3 p-4', ui.card)}>
        <label className={cn('text-xs font-medium', ui.label)}>
          Fuente
          <select className={cn('mt-1 w-full px-3 py-2', ui.select)} value={sourceKey} onChange={(event) => setSourceKey(event.target.value)}>
            {sources.map((row) => (
              <option key={row.source_key} value={row.source_key}>
                {row.display_name}
              </option>
            ))}
          </select>
        </label>

        {needsScout ? (
          <div className="flex flex-col gap-2">
            <label className={cn('text-xs font-medium', ui.label)}>
              Scout
              <select className={cn('mt-1 w-full px-3 py-2', ui.select)} value={scoutId} onChange={(event) => setScoutId(event.target.value)}>
                <option value="">Selecciona un scout</option>
                {scouts.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.display_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <input
                className={cn('min-w-0 flex-1 px-3 py-2 text-sm', ui.input)}
                placeholder="Nombre del scout"
                value={scoutName}
                onChange={(event) => setScoutName(event.target.value)}
              />
              <button type="button" className={ui.btnGhost} disabled={busy === 'scout'} onClick={() => void createScout()}>
                Registrar scout
              </button>
            </div>
          </div>
        ) : null}

        <label className={cn('text-xs font-medium', ui.label)}>
          Ejecución externa
          <input
            className={cn('mt-1 w-full px-3 py-2 text-sm', ui.input)}
            placeholder="Opcional. El mismo id reintenta sin duplicar."
            value={externalRunId}
            onChange={(event) => setExternalRunId(event.target.value)}
          />
        </label>

        <textarea
          className={cn('min-h-40 px-3 py-2 text-sm', ui.input)}
          placeholder="https://..."
          value={text}
          onChange={(event) => setText(event.target.value)}
        />

        <button
          type="button"
          className={cn('self-start rounded-full px-4 py-2 text-sm font-medium', ui.chipActive)}
          disabled={Boolean(busy)}
          onClick={() => void submit()}
        >
          {busy === 'submit' ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}
          Enviar
        </button>
        {banner ? <p className="text-sm text-rose-300">{banner}</p> : null}
      </div>

      {result ? (
        <div className={cn('p-4 text-sm', ui.card, ui.body)}>
          <p>Recibidas {result.received}</p>
          <p>Válidas {result.accepted}</p>
          <p>Duplicadas {result.duplicates + result.idempotent}</p>
          <p>Ya existentes {result.items.filter((item) => item.outcome === 'existing_offer').length}</p>
          <p>Rechazadas {result.invalid + result.overCap + result.items.filter((item) => item.outcome === 'lookup_failed').length}</p>
          <p>Enviadas al pipeline {result.advance?.forwarded ?? 0}</p>
          <p className={cn('mt-1', ui.muted)}>Enviada no es aprobada ni publicada. Sigue en moderación.</p>
          {result.persistError ? <p className="mt-2 text-rose-300">{result.persistError}</p> : null}
          {result.advance?.error ? <p className="mt-2 text-rose-300">{result.advance.error}</p> : null}
          {result.advance && result.advance.remaining > 0 ? (
            <p className={cn('mt-2', ui.muted)}>Quedan {result.advance.remaining} por revisar en la siguiente pasada.</p>
          ) : null}
          {result.advance && result.advance.processed > 0 ? (
            <p className={cn('mt-1', ui.muted)}>
              Revisadas en esta pasada: {result.advance.ready} listas, {result.advance.needsReview} a revisar, {result.advance.errored} con error.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
