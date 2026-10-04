'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TEAM_IDS, TEAM_LABELS, isTeamId, type TeamId } from '@/lib/team/roles/teams';
import { TEAM_ROLES, teamRoleLabel } from '@/lib/team/roles/catalog';
import { isMembershipStatus, type MembershipStatus } from '@/lib/team/roles/membership';
import { TEAM_MANAGEMENT_STEP_UP } from '@/lib/team/membership/reauth';
import {
  canAssignCandidate,
  candidateState,
  reconcileMember,
  readMemberStatusFilter,
  type CandidateMembership,
  type CandidateState,
  type MemberStatusFilter,
} from '@/lib/team/membership/view';

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

type Candidate = {
  id: string;
  displayName: string | null;
  username: string | null;
  self: boolean;
  memberships: CandidateMembership[];
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

type MutationBody = { membership?: Member | null; error?: string };

const STATUS_LABEL: Record<MembershipStatus, string> = {
  ACTIVE: 'Activa',
  SUSPENDED: 'Suspendida',
  REMOVED: 'Fuera del equipo',
};

const STATUS_FILTERS: { value: MemberStatusFilter; label: string }[] = [
  { value: 'live', label: 'Miembros actuales' },
  { value: 'ACTIVE', label: 'Activas' },
  { value: 'SUSPENDED', label: 'Suspendidas' },
  { value: 'REMOVED', label: 'Fuera del equipo (historial)' },
  { value: '', label: 'Todo el historial' },
];

const CANDIDATE_LABEL: Record<CandidateState, string> = {
  assignable: 'Se puede asignar',
  returning: 'Estuvo en el equipo · se puede asignar de nuevo',
  member: 'Ya está en el equipo',
  suspended: 'Suspendida en este equipo · reactívala desde la lista',
  self: 'Tu cuenta',
};

const ACTION_LABEL: Record<string, string> = {
  TEAM_MEMBER_ADDED: 'Alta',
  TEAM_ROLE_CHANGED: 'Cambio de rol',
  TEAM_MEMBERSHIP_SUSPENDED: 'Suspensión',
  TEAM_MEMBERSHIP_REACTIVATED: 'Reactivación',
  TEAM_MEMBER_REMOVED: 'Salida del equipo',
};

const SEARCH_DEBOUNCE_MS = 250;

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

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function TeamManagementClient() {
  const [teamFilter, setTeamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>('live');
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listFailed, setListFailed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [nextRole, setNextRole] = useState('');

  const [assignOpen, setAssignOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidatePage, setCandidatePage] = useState(0);
  const [hasMoreCandidates, setHasMoreCandidates] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resultsFor, setResultsFor] = useState<string | null>(null);
  const [pickedUser, setPickedUser] = useState<Candidate | null>(null);
  const [assignTeam, setAssignTeam] = useState<TeamId>('moderation');
  const [assignRole, setAssignRole] = useState<string>(TEAM_ROLES.moderation[0]);
  const [assignReason, setAssignReason] = useState('');

  /** Solo la última carga escribe estado; una respuesta vieja no pisa la nueva. */
  const loadSeq = useRef(0);
  const searchSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const headers = await authHeader();
    if (seq !== loadSeq.current) return;
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
    try {
      const [membersRes, auditRes] = await Promise.all([
        fetch(membersUrl, { headers, cache: 'no-store' }),
        fetch(auditUrl, { headers, cache: 'no-store' }),
      ]);
      const membersBody = await readJson<{ members?: Member[]; error?: string }>(membersRes);
      const auditBody = await readJson<{ events?: AuditEvent[]; error?: string }>(auditRes);
      if (seq !== loadSeq.current) return;
      if (!membersRes.ok) {
        setMembers([]);
        setListFailed(true);
        setError(membersBody?.error ?? 'No se pudieron cargar las membresías.');
        return;
      }
      setMembers(membersBody?.members ?? []);
      setListFailed(false);
      setEvents(auditRes.ok ? auditBody?.events ?? [] : []);
      setError(auditRes.ok ? null : auditBody?.error ?? 'No se pudo cargar el historial.');
    } catch {
      if (seq === loadSeq.current) {
        setMembers([]);
        setListFailed(true);
        setError('No se pudieron cargar las membresías.');
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [teamFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchCandidates = useCallback(async (term: string, page: number) => {
    const seq = ++searchSeq.current;
    setSearching(true);
    try {
      const headers = await authHeader();
      if (!headers) {
        if (seq === searchSeq.current) setSearchError('No hay sesión.');
        return;
      }
      const url = new URL('/api/admin/owner/team-management/users', window.location.origin);
      if (term) url.searchParams.set('q', term);
      url.searchParams.set('page', String(page));
      const res = await fetch(url, { headers, cache: 'no-store' });
      const body = await readJson<{ users?: Candidate[]; hasMore?: boolean; error?: string }>(res);
      if (seq !== searchSeq.current) return;
      if (!res.ok) {
        setSearchError(body?.error ?? 'No se pudo buscar.');
        return;
      }
      const users = body?.users ?? [];
      setCandidates((previous) => {
        if (page === 0) return users;
        const known = new Set(previous.map((user) => user.id));
        return [...previous, ...users.filter((user) => !known.has(user.id))];
      });
      setCandidatePage(page);
      setHasMoreCandidates(Boolean(body?.hasMore));
      setResultsFor(term);
      setSearchError(null);
    } catch {
      if (seq === searchSeq.current) setSearchError('No se pudo buscar.');
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!assignOpen) return;
    const timer = setTimeout(() => {
      void searchCandidates(query.trim(), 0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [assignOpen, query, searchCandidates]);

  const selected = members.find((member) => member.id === selectedId) ?? null;

  function applyPersisted(membership: Member) {
    setMembers((previous) => reconcileMember(previous, membership, { team: teamFilter, status: statusFilter }));
    setNextRole(membership.role);
    if (membership.status === 'REMOVED') {
      setNotice(`${personLabel(membership.displayName, membership.username, membership.userId)} ya no pertenece a ${teamLabel(membership.teamId)}.`);
    } else {
      setNotice(null);
    }
  }

  async function mutate(path: string, method: 'POST' | 'PATCH', payload: unknown): Promise<boolean> {
    setActionError(null);
    const headers = await authHeader();
    if (!headers) {
      setActionError('No hay sesión.');
      return false;
    }
    setBusy(true);
    try {
      const res = await fetch(path, {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await readJson<MutationBody>(res);
      if (!res.ok) {
        setActionError(body?.error ?? 'No se pudo guardar.');
        return false;
      }
      if (body?.membership) applyPersisted(body.membership);
      setAssignOpen(false);
      setConfirm(null);
      await load();
      return true;
    } catch {
      setActionError('No se pudo guardar.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  function ask(state: ConfirmState) {
    setConfirmReason('');
    setActionError(null);
    setConfirm(state);
  }

  function openAssign() {
    setAssignOpen(true);
    setPickedUser(null);
    setAssignReason('');
    setQuery('');
    setCandidates([]);
    setCandidatePage(0);
    setHasMoreCandidates(false);
    setResultsFor(null);
    setSearchError(null);
    setActionError(null);
  }

  const rolesForAssign = TEAM_ROLES[assignTeam];
  const pickedState = pickedUser ? candidateState(pickedUser, assignTeam) : null;
  /** Durante el debounce todavía no hay respuesta para el término actual: no es "sin resultados". */
  const searchPending = searching || (!searchError && resultsFor !== query.trim());

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Membresías</h1>
          <p className="mt-1 text-sm text-white/45">
            Quién está en cada equipo. Una membresía no abre /admin. Team OS es el espacio de trabajo de los
            miembros; como Owner supervisas el trabajo del equipo desde Team Hub.
            {TEAM_MANAGEMENT_STEP_UP.enforced
              ? ''
              : ' Los cambios usan la sesión de Owner; la reautenticación adicional todavía no está disponible.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/equipo"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white/80 hover:bg-white/[0.04]"
          >
            Abrir Team Hub
          </Link>
          <button
            type="button"
            onClick={openAssign}
            className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400"
          >
            Asignar al equipo
          </button>
        </div>
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
          onChange={(event) => setStatusFilter(readMemberStatusFilter(event.target.value) ?? 'live')}
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          aria-label="Filtrar por estado"
        >
          {STATUS_FILTERS.map((filter) => (
            <option key={filter.value || 'all'} value={filter.value}>{filter.label}</option>
          ))}
        </select>
      </div>

      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {actionError && !confirm && !assignOpen ? <p className="text-sm text-rose-300">{actionError}</p> : null}
      {notice ? <p className="text-sm text-emerald-300">{notice}</p> : null}
      {loading ? <p className="text-sm text-white/45">Cargando…</p> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <div className="overflow-hidden rounded-2xl border border-white/10">
          {listFailed ? (
            <p className="p-4 text-sm text-white/45">La lista no está disponible hasta que la carga funcione.</p>
          ) : members.length === 0 && !loading ? (
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
                      setNotice(null);
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
                      disabled={busy || nextRole === selected.role}
                      className="rounded-xl border border-white/15 px-3 py-2 disabled:opacity-40"
                      onClick={() => ask({
                        title: 'Cambiar rol',
                        body: `El rol pasará a ${roleLabel(selected.teamId, nextRole)}.`,
                        reasonRequired: true,
                        confirmLabel: 'Cambiar rol',
                        onConfirm: async (reason) => {
                          await mutate(
                            `/api/admin/owner/team-management/members/${selected.id}/role`,
                            'PATCH',
                            { role: nextRole, reason },
                          );
                        },
                      })}
                    >
                      Cambiar rol
                    </button>
                    {selected.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-xl border border-white/15 px-3 py-2 disabled:opacity-40"
                        onClick={() => ask({
                          title: 'Suspender',
                          body: 'Deja de tener acceso a este equipo mientras siga suspendida. La cuenta sigue existiendo.',
                          reasonRequired: true,
                          confirmLabel: 'Suspender',
                          onConfirm: async (reason) => {
                            await mutate(
                              `/api/admin/owner/team-management/members/${selected.id}/status`,
                              'PATCH',
                              { status: 'SUSPENDED', reason },
                            );
                          },
                        })}
                      >
                        Suspender
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-xl border border-white/15 px-3 py-2 disabled:opacity-40"
                        onClick={() => ask({
                          title: 'Reactivar',
                          body: 'Vuelve a tener acceso a este equipo.',
                          reasonRequired: false,
                          confirmLabel: 'Reactivar',
                          onConfirm: async (reason) => {
                            await mutate(
                              `/api/admin/owner/team-management/members/${selected.id}/status`,
                              'PATCH',
                              { status: 'ACTIVE', reason: reason || undefined },
                            );
                          },
                        })}
                      >
                        Reactivar
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded-xl border border-rose-400/40 px-3 py-2 text-rose-200 disabled:opacity-40"
                      onClick={() => ask({
                        title: 'Sacar del equipo',
                        body: `Vuelve a ser un usuario normal en ${teamLabel(selected.teamId)}: pierde el acceso y los permisos del equipo. Su historial, XP y auditoría se conservan. Puede volver con una nueva asignación.`,
                        reasonRequired: true,
                        confirmLabel: 'Sacar del equipo',
                        onConfirm: async (reason) => {
                          await mutate(
                            `/api/admin/owner/team-management/members/${selected.id}/status`,
                            'PATCH',
                            { status: 'REMOVED', reason },
                          );
                        },
                      })}
                    >
                      Sacar del equipo
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-white/45">Ya no pertenece a este equipo. Para volver hay que asignarlo de nuevo.</p>
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
          <div role="dialog" aria-modal="true" aria-labelledby="assign-title" className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl border border-white/10 bg-[#12121c] p-5 sm:rounded-3xl">
            <h2 id="assign-title" className="text-lg font-semibold">Asignar miembro</h2>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-white/40" htmlFor="assign-team">Equipo</label>
                <select
                  id="assign-team"
                  value={assignTeam}
                  onChange={(event) => {
                    const teamId = event.target.value;
                    if (!isTeamId(teamId)) return;
                    setAssignTeam(teamId);
                    setAssignRole(TEAM_ROLES[teamId][0]);
                    if (pickedUser && !canAssignCandidate(candidateState(pickedUser, teamId))) setPickedUser(null);
                  }}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
                >
                  {TEAM_IDS.map((teamId) => (
                    <option key={teamId} value={teamId}>{TEAM_LABELS[teamId]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/40" htmlFor="assign-role">Rol</label>
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
              </div>
            </div>

            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o usuario"
              aria-label="Buscar usuarios"
              maxLength={80}
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
            />

            <div className="mt-2 min-h-0 flex-1 overflow-auto">
              {searchError ? <p className="py-2 text-sm text-rose-300">{searchError}</p> : null}
              {!searchPending && !searchError && candidates.length === 0 ? (
                <p className="py-2 text-sm text-white/45">Sin resultados.</p>
              ) : null}
              <ul className="space-y-1" role="radiogroup" aria-label="Usuarios">
                {candidates.map((user) => {
                  const state = candidateState(user, assignTeam);
                  const assignable = canAssignCandidate(state);
                  const picked = pickedUser?.id === user.id;
                  return (
                    <li key={user.id}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={picked}
                        disabled={!assignable}
                        onClick={() => setPickedUser(user)}
                        className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                          picked ? 'bg-violet-500/20' : 'hover:bg-white/[0.04]'
                        }`}
                      >
                        <span aria-hidden className={`mt-1 h-3 w-3 shrink-0 rounded-full border ${picked ? 'border-violet-300 bg-violet-400' : 'border-white/40'}`} />
                        <span className="min-w-0">
                          <span className="block truncate text-white/90">{user.displayName || (user.username ? `@${user.username}` : user.id)}</span>
                          <span className="block truncate text-white/40">
                            {user.username ? `@${user.username} · ` : ''}{CANDIDATE_LABEL[state]}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {searchPending ? <p className="py-2 text-sm text-white/45">Buscando…</p> : null}
              {hasMoreCandidates && !searchPending ? (
                <button
                  type="button"
                  onClick={() => void searchCandidates(query.trim(), candidatePage + 1)}
                  className="mt-2 w-full rounded-xl border border-white/15 px-3 py-2 text-sm"
                >
                  Cargar más
                </button>
              ) : null}
            </div>

            <label className="mt-3 block text-xs text-white/40" htmlFor="assign-reason">Motivo</label>
            <textarea
              id="assign-reason"
              value={assignReason}
              onChange={(event) => setAssignReason(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
              rows={2}
            />
            {actionError ? <p role="alert" className="mt-3 text-sm text-rose-300">{actionError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAssignOpen(false)} className="rounded-xl px-3 py-2 text-sm text-white/60">Cancelar</button>
              <button
                type="button"
                disabled={!pickedUser || !pickedState || !canAssignCandidate(pickedState) || busy}
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
            {actionError ? <p role="alert" className="mt-3 text-sm text-rose-300">{actionError}</p> : null}
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
