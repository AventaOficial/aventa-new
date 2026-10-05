'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';
import { MCP_DEFAULT_DAILY_CANDIDATE_CAP, MCP_SCOPES, type McpScope } from '@/lib/mcp/contract';
import type { MachineClientPublic } from '@/lib/mcp/machineClients';

const STATUS_LABEL: Record<MachineClientPublic['status'], string> = {
  active: 'Activo',
  paused: 'Pausado',
  revoked: 'Revocado',
};

const EMPTY_FORM = {
  name: '',
  authorProfileId: '',
  dailyCandidateCap: String(MCP_DEFAULT_DAILY_CANDIDATE_CAP),
  expiresAt: '',
  scopes: ['candidates:submit', 'candidates:read', 'catalog:read'] as McpScope[],
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminMachineClientsPage() {
  const { session } = useAuth();
  const [clients, setClients] = useState<MachineClientPublic[]>([]);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [ingestEnabled, setIngestEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const authHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    return headers;
  }, [session?.access_token]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/machine-clients', { headers: authHeaders(), cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'No se pudo cargar');
        return;
      }
      setClients(body.clients ?? []);
      setNeedsMigration(Boolean(body.needsMigration));
      setIngestEnabled(Boolean(body.ingestEnabled));
      setError(null);
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!session?.access_token) return;
    void load();
  }, [session?.access_token, load]);

  const toggleScope = (scope: McpScope) =>
    setForm((f) => ({
      ...f,
      scopes: f.scopes.includes(scope) ? f.scopes.filter((s) => s !== scope) : [...f.scopes, scope],
    }));

  const create = async () => {
    setSaving(true);
    setError(null);
    setNewToken(null);
    setCopied(false);
    try {
      const res = await fetch('/api/admin/machine-clients', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          name: form.name,
          authorProfileId: form.authorProfileId,
          dailyCandidateCap: Number(form.dailyCandidateCap),
          expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
          scopes: form.scopes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'No se pudo crear');
        return;
      }
      setNewToken(typeof body.token === 'string' ? body.token : null);
      setForm(EMPTY_FORM);
      await load();
    } catch {
      setError('Error de red');
    } finally {
      setSaving(false);
    }
  };

  const act = async (client: MachineClientPublic, action: 'pause' | 'resume' | 'revoke') => {
    if (action === 'revoke' && !window.confirm(`Revocar «${client.name}» es permanente. ¿Continuar?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/admin/machine-clients/${client.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(typeof body.error === 'string' ? body.error : 'No se pudo actualizar');
      await load();
    } catch {
      setError('Error de red');
    }
  };

  const copyToken = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const input =
    'mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white';

  return (
    <div className="space-y-6 text-gray-900 dark:text-white">
      <div>
        <h1 className="text-2xl font-bold">Clientes MCP</h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-zinc-400">
          Bots externos que proponen candidatos de ofertas. Solo sugieren: cada candidato entra a la cola de lotes y una persona
          decide. No publican, no moderan y no ganan dinero.
        </p>
      </div>

      <p
        className={`rounded-xl border px-4 py-3 text-sm ${ingestEnabled ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-gray-200 dark:border-zinc-800'}`}
      >
        Recepción de candidatos: <strong>{ingestEnabled ? 'ENCENDIDA' : 'APAGADA'}</strong>. Se controla con la variable de entorno
        MCP_INGEST_ENABLED, no desde aquí.
      </p>

      {needsMigration ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Falta aplicar la migración de clientes MCP. Hasta entonces no se pueden crear clientes.
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {newToken ? (
        <section className="space-y-2 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
          <p className="font-semibold">Token nuevo. Cópialo ahora: no se vuelve a mostrar y no se puede recuperar.</p>
          <code className="block break-all rounded-lg bg-black/80 px-3 py-2 font-mono text-xs text-white">{newToken}</code>
          <div className="flex gap-2">
            <button type="button" onClick={copyToken} className="rounded-xl bg-gray-900 px-3 py-1.5 text-white dark:bg-white dark:text-black">
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button type="button" onClick={() => setNewToken(null)} className="rounded-xl border border-gray-300 px-3 py-1.5 dark:border-zinc-700">
              Ya lo guardé
            </button>
          </div>
        </section>
      ) : null}

      <section className="grid gap-3 rounded-2xl border border-gray-200 p-4 dark:border-zinc-800 sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">Nuevo cliente</h2>
        <label className="block text-xs text-gray-600 dark:text-zinc-400">
          Nombre
          <input value={form.name} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={input} />
        </label>
        <label className="block text-xs text-gray-600 dark:text-zinc-400">
          Perfil bot autor
          <input
            value={form.authorProfileId}
            placeholder="uuid declarado en MCP_BOT_AUTHOR_USER_IDS"
            onChange={(e) => setForm((f) => ({ ...f, authorProfileId: e.target.value.trim() }))}
            className={input}
          />
        </label>
        <label className="block text-xs text-gray-600 dark:text-zinc-400">
          Cuota diaria de candidatos
          <input
            type="number"
            min={1}
            max={1000}
            value={form.dailyCandidateCap}
            onChange={(e) => setForm((f) => ({ ...f, dailyCandidateCap: e.target.value }))}
            className={input}
          />
        </label>
        <label className="block text-xs text-gray-600 dark:text-zinc-400">
          Vence
          <input
            type="datetime-local"
            value={form.expiresAt}
            onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
            className={input}
          />
        </label>
        <fieldset className="text-xs text-gray-600 dark:text-zinc-400 sm:col-span-2">
          <legend>Permisos</legend>
          <div className="mt-1 flex flex-wrap gap-3">
            {MCP_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-1.5 text-sm text-gray-900 dark:text-white">
                <input type="checkbox" checked={form.scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                <span className="font-mono text-xs">{scope}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="sm:col-span-2">
          <button
            type="button"
            disabled={saving || needsMigration || !form.name.trim() || !form.authorProfileId || form.scopes.length === 0}
            onClick={create}
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {saving ? 'Creando…' : 'Crear cliente'}
          </button>
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-zinc-800">
        {loading ? (
          <p className="p-4 text-sm text-gray-500">Cargando…</p>
        ) : clients.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">Todavía no hay clientes.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-gray-500 dark:text-zinc-500">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Permisos</th>
                <th className="px-3 py-2">Autor bot</th>
                <th className="px-3 py-2">Cuota diaria</th>
                <th className="px-3 py-2">Vence</th>
                <th className="px-3 py-2">Creado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-t border-gray-100 dark:border-zinc-800">
                  <td className="px-3 py-2">
                    <p className="font-medium">{c.name}</p>
                    <p className="font-mono text-xs text-gray-500">{c.tokenPrefix}…</p>
                  </td>
                  <td className="px-3 py-2">{STATUS_LABEL[c.status]}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.scopes.join(', ')}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.authorProfileId}</td>
                  <td className="px-3 py-2">{c.dailyCandidateCap}</td>
                  <td className="px-3 py-2">{formatDate(c.expiresAt)}</td>
                  <td className="px-3 py-2">{formatDate(c.createdAt)}</td>
                  <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                    {c.status === 'active' ? (
                      <button type="button" onClick={() => act(c, 'pause')} className="rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-zinc-700">
                        Pausar
                      </button>
                    ) : null}
                    {c.status === 'paused' ? (
                      <button type="button" onClick={() => act(c, 'resume')} className="rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-zinc-700">
                        Reanudar
                      </button>
                    ) : null}
                    {c.status !== 'revoked' ? (
                      <button type="button" onClick={() => act(c, 'revoke')} className="rounded-lg border border-red-400 px-2 py-1 text-xs text-red-600">
                        Revocar
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
