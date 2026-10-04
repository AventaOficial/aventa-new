'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TEAM_IDS, TEAM_LABELS, isTeamId, type TeamId } from '@/lib/team/roles/teams';
import { TEAM_ROLES, teamRoleLabel } from '@/lib/team/roles/catalog';
import { MEMBERSHIP_STATUSES, isMembershipStatus, type MembershipStatus } from '@/lib/team/roles/membership';
import { TEAM_MANAGEMENT_STEP_UP } from '@/lib/team/membership/reauth';

type Member = {
  id: string;
  userId: string;
  displayName: string | null;
  username: string | null;
  teamId: string;
  role: string;
  status: string;
  assignedByName: string | null;
  createdAt: string;
};

type FoundUser = {
  id: string;
  display_name: string | null;
  username: string | null;
  email: string | null;
};

type AuditEvent = {
  id: string;
  action: string;
  teamId: string;
  reason: string | null;
  createdAt: string;
  actorId: string;
  targetUserId: string;
  requestId: string;
  previousState: unknown;
  newState: unknown;
};

type ConfirmState = {
  title: string;
  body: string;
  reasonRequired: boolean;
  confirmLabel: string;
  onConfirm: (reason: string) => Promise<void>;
};

const STATUS_LABEL: Record<MembershipStatus, string> = {
  ACTIVE: 'Activa',
  SUSPENDED: 'Suspendida',
  REMOVED: 'Removida',
};

const ACTION_LABEL: Record<string, string> = {
  TEAM_MEMBER_ADDED: 'Alta',
  TEAM_ROLE_CHANGED: 'Cambio de rol',
  TEAM_MEMBERSHIP_SUSPENDED: 'Suspensión',
  TEAM_MEMBERSHIP_REACTIVATED: 'Reactivación',
  TEAM_MEMBER_REMOVED: 'Remoción',
};

async function authHeader(): Promise<HeadersInit | null> {
  const { data: { session } } = await createClient().auth.getSession();
  if (!session?.access_token) return null;
  return { Authorization: `Bearer ${session.access_token}` };
}

function personLabel(name: string | null, username: string | null, id: string): string {
  if (name && username) return `${name} · @${username}`;
  return name || (username ? `@${username}` : id);
}

function roleLabel(teamId: string, role: string): string {
  return isTeamId(teamId) ? teamRoleLabel(teamId, role) : role;
}

function statusLabel(status: string): string {
  return isMembershipStatus(status) ? STATUS_LABEL[status] : status;
}

function teamLabel(teamId: string): string {
  return isTeamId(teamId) ? TEAM_LABELS[teamId] : teamId;
}

export default function TeamManagementClient() {
  const [teamFilter, setTeamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<FoundUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [pickedUser, setPickedUser] = useState<FoundUser | null>(null);
  const [assignTeam, setAssignTeam] = useState<TeamId>('moderation');
  const [assignRole, setAssignRole] = useState<string>(TEAM_ROLES.moderation[0]);
  const [assignReason, setAssignReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [nextRole, setNextRole] = useState('');

  const load = useCallback(async () => {
    const headers = await authHeader();
    if (!headers) {
      setError('No hay sesión.');
      setLoading(false);
      return;
    }
    const membersUrl = new URL('/api/admin/owner/team-management/members', window.location.origin);
    const auditUrl = new URL('/api/admin/owner/team-management/audit', window.location.origin);
    if (teamFilter) {
      membersUrl.searchParams.set('team', teamFilter);
      auditUrl.searchParams.set('team', teamFilter);
    }
    if (statusFilter) membersUrl.searchParams.set('status', statusFilter);
    const [membersRes, auditRes] = await Promise.all([
      fetch(membersUrl, { headers, cache: 'no-store' }),
      fetch(auditUrl, { headers, cache: 'no-store' }),
    ]);
    const membersBody = (await membersRes.json()) as { members?: Member[]; error?: string };
    const auditBody = (await auditRes.json()) as { events?: AuditEvent[]; error?: string };
    if (!membersRes.ok) {
      setError(membersBody.error ?? 'No se pudieron cargar las membresías.');
      setLoading(false);
      return;
    }
    setMembers(membersBody.members ?? []);
    setEvents(auditRes.ok ? auditBody.events ?? [] : []);
    setError(auditRes.ok ? null : auditBody.error ?? null);
    setLoading(false);
  }, [teamFilter, statusFilter]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await load();
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const selected = members.find((member) => member.id === selectedId) ?? null;

  async function searchUsers() {
    const headers = await authHeader();
    if (!headers) return;
    const url = new URL('/api/admin/owner/team-management/users', window.location.origin);
    url.searchParams.set('q', query.trim());
    const res = await fetch(url, { headers, cache: 'no-store' });
    const body = (await res.json()) as { users?: FoundUser[]; error?: string };
    if (!res.ok) {
      setError(body.error ?? 'No se pudo buscar.');
      return;
    }
    setFound(body.users ?? []);
    setError(null);
  }

  async function mutate(path: string, method: 'POST' | 'PATCH', payload: unknown) {
    const headers = await authHeader();
    if (!headers) return;
    setBusy(true);
    const res = await fetch(path, {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? 'No se pudo guardar.');
      return;
    }
    setError(null);
    setAssignOpen(false);
    setConfirm(null);
    await load();
  }

  function ask(state: ConfirmState) {
    setConfirmReason('');
    setConfirm(state);
  }

  const rolesForAssign = TEAM_ROLES[assignTeam];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Membresías</h1>
          <p className="mt-1 text-sm text-white/45">
            Quién está en cada equipo. Una membresía no abre /admin.
            {TEAM_MANAGEMENT_STEP_UP.enforced
              ? ''
              : ' Los cambios usan la sesión de Owner; la reautenticación adicional todavía no está disponible.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setAssignOpen(true);
            setPickedUser(null);
            setAssignReason('');
          }}
          className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400"
        >
          Asignar al equipo
        </button>
      </header>

      <div className="flex flex-wrap gap-2">
        <select
          value={teamFilter}
          onChange={(event) => setTeamFilter(event.target.value)}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          aria-label="Filtrar por equipo"
        >
          <option value="">Todos los equipos</option>
          {TEAM_IDS.map((teamId) => (
            <option key={teamId} value={teamId}>{TEAM_LABELS[teamId]}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {MEMBERSHIP_STATUSES.map((status) => (
            <option key={status} value={status}>{STATUS_LABEL[status]}</option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {loading ? <p className="text-sm text-white/45">Cargando…</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <div className="overflow-hidden rounded-2xl border border-white/10">
          {members.length === 0 && !loading ? (
            <p className="p-4 text-sm text-white/45">No hay membresías con este filtro.</p>
          ) : (
            <ul>
              {members.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(member.id);
                      setNextRole(member.role);
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-white/[0.04] ${
                      selectedId === member.id ? 'bg-violet-500/10' : ''
                    }`}
                  >
                    <span>
                      <span className="block font-medium text-white/90">
                        {personLabel(member.displayName, member.username, member.userId)}
                      </span>
                      <span className="text-white/40">
                        {teamLabel(member.teamId)} · {roleLabel(member.teamId, member.role)}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-white/50">
                      {statusLabel(member.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="rounded-2xl border border-white/10 p-4">
          {selected ? (
            <div className="space-y-3 text-sm">
              <h2 className="font-semibold text-white">Ficha</h2>
              <p>{personLabel(selected.displayName, selected.username, selected.userId)}</p>
              <p className="text-white/50">{selected.userId}</p>
              <p>{teamLabel(selected.teamId)} · {roleLabel(selected.teamId, selected.role)}</p>
              <p>Estado: {statusLabel(selected.status)}</p>
              <p className="text-white/50">
                Asignada {new Date(selected.createdAt).toLocaleString('es-MX')}
                {selected.assignedByName ? ` por ${selected.assignedByName}` : ''}
              </p>
              {selected.status !== 'REMOVED' && isTeamId(selected.teamId) ? (
                <div className="space-y-2 border-t border-white/10 pt-3">
                  <label className="block text-xs text-white/40" htmlFor="next-role">Rol</label>
                  <select
                    id="next-role"
                    value={nextRole}
                    onChange={(event) => setNextRole(event.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
                  >
                    {TEAM_ROLES[selected.teamId].map((role) => (
                      <option key={role} value={role}>{roleLabel(selected.teamId, role)}</option>
                    ))}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-xl border border-white/15 px-3 py-2"
                      onClick={() => ask({
                        title: 'Cambiar rol',
                        body: `El rol pasará a ${roleLabel(selected.teamId, nextRole)}.`,
                        reasonRequired: true,
                        confirmLabel: 'Cambiar rol',
                        onConfirm: (reason) => mutate(
                          `/api/admin/owner/team-management/members/${selected.id}/role`,
                          'PATCH',
                          { role: nextRole, reason },
                        ),
                      })}
                    >
                      Cambiar rol
                    </button>
                    {selected.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        className="rounded-xl border border-white/15 px-3 py-2"
                        onClick={() => ask({
                          title: 'Suspender',
                          body: 'Deja de tener acceso a este equipo. La cuenta sigue existiendo.',
                          reasonRequired: true,
                          confirmLabel: 'Suspender',
                          onConfirm: (reason) => mutate(
                            `/api/admin/owner/team-management/members/${selected.id}/status`,
                            'PATCH',
                            { status: 'SUSPENDED', reason },
                          ),
                        })}
                      >
                        Suspender
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-xl border border-white/15 px-3 py-2"
                        onClick={() => ask({
                          title: 'Reactivar',
                          body: 'Vuelve a tener acceso a este equipo.',
                          reasonRequired: false,
                          confirmLabel: 'Reactivar',
                          onConfirm: (reason) => mutate(
                            `/api/admin/owner/team-management/members/${selected.id}/status`,
                            'PATCH',
                            { status: 'ACTIVE', reason: reason || undefined },
                          ),
                        })}
                      >
                        Reactivar
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded-xl border border-rose-400/40 px-3 py-2 text-rose-200"
                      onClick={() => ask({
                        title: 'Remover del equipo',
                        body: 'La cuenta permanece. La membresía queda como historial.',
                        reasonRequired: true,
                        confirmLabel: 'Remover',
                        onConfirm: (reason) => mutate(
                          `/api/admin/owner/team-management/members/${selected.id}/status`,
                          'PATCH',
                          { status: 'REMOVED', reason },
                        ),
                      })}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-white/45">Esta membresía es historial. Para volver al equipo hay que asignarla de nuevo.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/45">Elige una membresía para ver acciones.</p>
          )}
        </aside>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-white/70">Historial</h2>
        {events.length === 0 ? (
          <p className="text-sm text-white/40">Sin cambios registrados.</p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id} className="rounded-xl border border-white/10 px-3 py-2 text-sm">
                <span className="text-white/80">{ACTION_LABEL[event.action] ?? event.action}</span>
                <span className="text-white/40"> · {teamLabel(event.teamId)} · {new Date(event.createdAt).toLocaleString('es-MX')}</span>
                {event.reason ? <span className="block text-white/50">{event.reason}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {assignOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Cerrar" onClick={() => setAssignOpen(false)} />
          <div role="dialog" aria-modal="true" aria-labelledby="assign-title" className="relative z-10 w-full max-w-lg rounded-t-3xl border border-white/10 bg-[#12121c] p-5 sm:rounded-3xl">
            <h2 id="assign-title" className="text-lg font-semibold">Asignar al equipo</h2>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void searchUsers();
              }}
            >
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Nombre, usuario o correo"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                />
                <button type="submit" className="rounded-xl border border-white/15 px-3 py-2 text-sm">Buscar</button>
              </div>
            </form>
            <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
              {found.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => setPickedUser(user)}
                    className={`w-full rounded-xl px-3 py-2 text-left text-sm ${pickedUser?.id === user.id ? 'bg-violet-500/20' : 'hover:bg-white/[0.04]'}`}
                  >
                    {personLabel(user.display_name, user.username, user.id)}
                    {user.email ? <span className="block text-white/40">{user.email}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            <label className="mt-3 block text-xs text-white/40" htmlFor="assign-team">Equipo</label>
            <select
              id="assign-team"
              value={assignTeam}
              onChange={(event) => {
                const teamId = event.target.value;
                if (!isTeamId(teamId)) return;
                setAssignTeam(teamId);
                setAssignRole(TEAM_ROLES[teamId][0]);
              }}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
            >
              {TEAM_IDS.map((teamId) => (
                <option key={teamId} value={teamId}>{TEAM_LABELS[teamId]}</option>
              ))}
            </select>
            <label className="mt-3 block text-xs text-white/40" htmlFor="assign-role">Rol</label>
            <select
              id="assign-role"
              value={assignRole}
              onChange={(event) => setAssignRole(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
            >
              {rolesForAssign.map((role) => (
                <option key={role} value={role}>{roleLabel(assignTeam, role)}</option>
              ))}
            </select>
            <label className="mt-3 block text-xs text-white/40" htmlFor="assign-reason">Motivo</label>
            <textarea
              id="assign-reason"
              value={assignReason}
              onChange={(event) => setAssignReason(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
              rows={2}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAssignOpen(false)} className="rounded-xl px-3 py-2 text-sm text-white/60">Cancelar</button>
              <button
                type="button"
                disabled={!pickedUser || busy}
                onClick={() => {
                  if (!pickedUser) return;
                  void mutate('/api/admin/owner/team-management/members', 'POST', {
                    userId: pickedUser.id,
                    teamId: assignTeam,
                    role: assignRole,
                    reason: assignReason || undefined,
                  });
                }}
                className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button type="button" className="absolute inset-0 bg-black/60" aria-label="Cerrar" onClick={() => setConfirm(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="relative z-10 w-full max-w-md rounded-t-3xl border border-white/10 bg-[#12121c] p-5 sm:rounded-3xl">
            <h2 id="confirm-title" className="text-lg font-semibold">{confirm.title}</h2>
            <p className="mt-2 text-sm text-white/60">{confirm.body}</p>
            <label className="mt-3 block text-xs text-white/40" htmlFor="confirm-reason">
              Motivo{confirm.reasonRequired ? '' : ' (opcional)'}
            </label>
            <textarea
              id="confirm-reason"
              value={confirmReason}
              onChange={(event) => setConfirmReason(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
              rows={3}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="rounded-xl px-3 py-2 text-sm text-white/60">Cancelar</button>
              <button
                type="button"
                disabled={busy || (confirm.reasonRequired && confirmReason.trim().length === 0)}
                onClick={() => void confirm.onConfirm(confirmReason.trim())}
                className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold disabled:opacity-40"
              >
                {confirm.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
