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

type HunterOption = { code: string; displayName: string; avatarUrl: string | null; specialty: string; accent: string };
type AuthorOption = { id: string; displayName: string | null };

const EMPTY_FORM = {
  name: '',
  hunterCode: '',
  authorProfileId: '',
  dailyCandidateCap: String(MCP_DEFAULT_DAILY_CANDIDATE_CAP),
  expiresAt: '',
  scopes: ['candidates:submit', 'candidates:read', 'catalog:read'] as McpScope[],
};

type EditForm = { id: string; name: string; hunterCode: string; dailyCandidateCap: string; expiresAt: string };

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

/** ISO a valor de `datetime-local` en hora local. */
function toLocalInput(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function HunterBadge({ hunter }: { hunter: HunterOption | null }) {
  if (!hunter) {
    return <span className="text-xs text-gray-500">Sin hunter (se presenta como Ximena)</span>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      {hunter.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={hunter.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
      ) : (
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ backgroundColor: hunter.accent }}
          aria-hidden
        >
          {hunter.displayName.charAt(0)}
        </span>
      )}
      <span className="font-medium">{hunter.displayName}</span>
    </span>
  );
}

export default function AdminMachineClientsPage() {
  const { session } = useAuth();
  const [clients, setClients] = useState<MachineClientPublic[]>([]);
  const [hunters, setHunters] = useState<HunterOption[]>([]);
  const [authors, setAuthors] = useState<AuthorOption[]>([]);
  const [hunterCodeReady, setHunterCodeReady] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [ingestEnabled, setIngestEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState<EditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

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
      const authorList: AuthorOption[] = Array.isArray(body.authors) ? body.authors : [];
      setClients(body.clients ?? []);
      setHunters(Array.isArray(body.hunters) ? body.hunters : []);
      setAuthors(authorList);
      setHunterCodeReady(body.hunterCodeReady !== false);
      setNeedsMigration(Boolean(body.needsMigration));
      setIngestEnabled(Boolean(body.ingestEnabled));
      if (authorList.length === 1) {
        setForm((f) => (f.authorProfileId ? f : { ...f, authorProfileId: authorList[0].id }));
      }
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

  const hunterFor = (code: string | null) => hunters.find((h) => h.code === code) ?? null;
  const authorLabel = (id: string) => {
    const author = authors.find((a) => a.id === id);
    return author?.displayName ?? `${id.slice(0, 8)}…`;
  };

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
          ...(form.hunterCode ? { hunterCode: form.hunterCode } : {}),
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
      setForm({ ...EMPTY_FORM, authorProfileId: authors.length === 1 ? authors[0].id : '' });
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

  const startEdit = (client: MachineClientPublic) =>
    setEditing({
      id: client.id,
      name: client.name,
      hunterCode: client.hunterCode ?? '',
      dailyCandidateCap: String(client.dailyCandidateCap),
      expiresAt: toLocalInput(client.expiresAt),
    });

  const saveEdit = async () => {
    if (!editing) return;
    const original = clients.find((c) => c.id === editing.id);
    setSavingEdit(true);
    setError(null);
    try {
      const expiresAt = editing.expiresAt ? new Date(editing.expiresAt).toISOString() : null;
      const res = await fetch(`/api/admin/machine-clients/${editing.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          action: 'edit',
          name: editing.name,
          ...(hunterCodeReady ? { hunterCode: editing.hunterCode || null } : {}),
          dailyCandidateCap: Number(editing.dailyCandidateCap),
          ...(toLocalInput(original?.expiresAt ?? null) !== editing.expiresAt ? { expiresAt } : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body.error === 'string' ? body.error : 'No se pudo guardar');
        return;
      }
      setEditing(null);
      await load();
    } catch {
      setError('Error de red');
    } finally {
      setSavingEdit(false);
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
  const selectedHunter = hunterFor(form.hunterCode || null);

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
      {!hunterCodeReady ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Este entorno no tiene la columna hunter_code. Los clientes se presentan con el hunter predeterminado.
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
          Hunter
          <select
            value={form.hunterCode}
            disabled={!hunterCodeReady}
            onChange={(e) => setForm((f) => ({ ...f, hunterCode: e.target.value }))}
            className={input}
          >
            <option value="">Elige un hunter…</option>
            {hunters.map((h) => (
              <option key={h.code} value={h.code}>
                {h.displayName}
              </option>
            ))}
          </select>
          {selectedHunter ? <span className="mt-1 block text-[11px]">{selectedHunter.specialty}</span> : null}
        </label>
        <label className="block text-xs text-gray-600 dark:text-zinc-400">
          Perfil bot autor
          <select
            value={form.authorProfileId}
            onChange={(e) => setForm((f) => ({ ...f, authorProfileId: e.target.value }))}
            className={input}
          >
            <option value="">Elige el perfil autor…</option>
            {authors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName ?? `${a.id.slice(0, 8)}…`}
              </option>
            ))}
          </select>
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
            disabled={
              saving ||
              needsMigration ||
              !form.name.trim() ||
              !form.authorProfileId ||
              (hunterCodeReady && !form.hunterCode) ||
              form.scopes.length === 0
            }
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
                <th className="px-3 py-2">Hunter</th>
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
              {clients.map((c) =>
                editing?.id === c.id ? (
                  <tr key={c.id} className="border-t border-gray-100 bg-gray-50 dark:border-zinc-800 dark:bg-zinc-900/60">
                    <td colSpan={9} className="px-3 py-3">
                      <div className="grid gap-3 sm:grid-cols-4">
                        <label className="block text-xs text-gray-600 dark:text-zinc-400">
                          Nombre
                          <input
                            value={editing.name}
                            maxLength={80}
                            onChange={(e) => setEditing((f) => (f ? { ...f, name: e.target.value } : f))}
                            className={input}
                          />
                        </label>
                        <label className="block text-xs text-gray-600 dark:text-zinc-400">
                          Hunter
                          <select
                            value={editing.hunterCode}
                            disabled={!hunterCodeReady}
                            onChange={(e) => setEditing((f) => (f ? { ...f, hunterCode: e.target.value } : f))}
                            className={input}
                          >
                            <option value="">Sin hunter (Ximena)</option>
                            {hunters.map((h) => (
                              <option key={h.code} value={h.code}>
                                {h.displayName}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block text-xs text-gray-600 dark:text-zinc-400">
                          Cuota diaria
                          <input
                            type="number"
                            min={1}
                            max={1000}
                            value={editing.dailyCandidateCap}
                            onChange={(e) => setEditing((f) => (f ? { ...f, dailyCandidateCap: e.target.value } : f))}
                            className={input}
                          />
                        </label>
                        <label className="block text-xs text-gray-600 dark:text-zinc-400">
                          Vence (vacío = sin vencimiento)
                          <input
                            type="datetime-local"
                            value={editing.expiresAt}
                            onChange={(e) => setEditing((f) => (f ? { ...f, expiresAt: e.target.value } : f))}
                            className={input}
                          />
                        </label>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        El token, los permisos y el autor no se editan. Si hay que cambiarlos, crea un cliente nuevo.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={savingEdit || !editing.name.trim()}
                          onClick={saveEdit}
                          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
                        >
                          {savingEdit ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs dark:border-zinc-700"
                        >
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={c.id} className="border-t border-gray-100 dark:border-zinc-800">
                    <td className="px-3 py-2">
                      <HunterBadge hunter={hunterFor(c.hunterCode)} />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{c.name}</p>
                      <p className="font-mono text-xs text-gray-500">{c.tokenPrefix}…</p>
                    </td>
                    <td className="px-3 py-2">{STATUS_LABEL[c.status]}</td>
                    <td className="px-3 py-2 font-mono text-xs">{c.scopes.join(', ')}</td>
                    <td className="px-3 py-2 text-xs" title={c.authorProfileId}>
                      {authorLabel(c.authorProfileId)}
                    </td>
                    <td className="px-3 py-2">{c.dailyCandidateCap}</td>
                    <td className="px-3 py-2">{formatDate(c.expiresAt)}</td>
                    <td className="px-3 py-2">{formatDate(c.createdAt)}</td>
                    <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                      {c.status !== 'revoked' ? (
                        <button type="button" onClick={() => startEdit(c)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs dark:border-zinc-700">
                          Editar
                        </button>
                      ) : null}
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
                ),
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
