'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';

type SearchUser = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export function TeamOsPasswordTools() {
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState<string | null>(null);
  const [passwordNote, setPasswordNote] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || !session?.access_token) {
      setResults([]);
      return;
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&limit=30`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const data = await res.json().catch(() => ({}));
        const users = Array.isArray(data.users) ? data.users : [];
        setResults(
          users
            .filter((u: SearchUser) => typeof u.user_id === 'string' && u.user_id.length > 0)
            .slice(0, 8),
        );
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [search, session?.access_token]);

  const handleEquipoPassword = useCallback(
    async (userId: string, action: 'recovery_email' | 'generate_temporary') => {
      if (action === 'generate_temporary') {
        const confirmed = window.confirm(
          'Esto cambiará la contraseña de Supabase Auth de la persona para toda Aventa, no solo Team OS. La persona podría perder acceso con su contraseña actual. La contraseña generada no expira automáticamente ni fuerza un cambio al iniciar sesión; coordina que la cambie inmediatamente. Úsalo únicamente con autorización y compártela por un canal seguro. ¿Continuar?'
        );
        if (!confirmed) return;
      }
      setPasswordBusy(userId);
      setPasswordNote(null);
      try {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
        const res = await fetch(`/api/admin/team-os/users/${userId}/access`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error ?? 'No se pudo completar');
        if (typeof data.temporary_password === 'string') {
          const warning = typeof data.message === 'string' ? data.message : 'La contraseña temporal cambia el acceso global a Aventa.';
          setPasswordNote(`${warning} Contraseña: ${data.temporary_password} (cópiala ahora).`);
        } else {
          setPasswordNote(typeof data.message === 'string' ? data.message : 'Correo enviado.');
        }
      } catch (e) {
        setPasswordNote(e instanceof Error ? e.message : 'Error al gestionar contraseña');
      } finally {
        setPasswordBusy(null);
      }
    },
    [session?.access_token],
  );

  return (
    <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-[#141414]">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Acceso Team OS (contraseña)</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Envía un enlace de recuperación o cambia la contraseña global de Supabase Auth. La contraseña no es independiente de Team OS: afecta el inicio de sesión en toda Aventa. Prefiere el enlace de recuperación salvo que la persona haya autorizado una contraseña temporal.
      </p>
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar colaborador por nombre…"
        className="mt-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-[#0c0c0c]"
      />
      {searching ? <p className="mt-2 text-xs text-gray-500">Buscando…</p> : null}
      <ul className="mt-3 space-y-2">
        {results.map((u) => (
          <li
            key={u.user_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2 dark:bg-white/5"
          >
            <span className="text-sm font-medium truncate">
              {u.display_name ?? u.user_id.slice(0, 8)}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={passwordBusy === u.user_id}
                className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                onClick={() => void handleEquipoPassword(u.user_id, 'recovery_email')}
              >
                Enlace correo
              </button>
              <button
                type="button"
                disabled={passwordBusy === u.user_id}
                className="rounded-lg border border-violet-300 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:border-violet-700 dark:text-violet-300 disabled:opacity-50"
                onClick={() => void handleEquipoPassword(u.user_id, 'generate_temporary')}
              >
                Cambiar contraseña
              </button>
            </div>
          </li>
        ))}
      </ul>
      {passwordNote ? <p className="mt-3 text-sm text-amber-800 dark:text-amber-200">{passwordNote}</p> : null}
    </section>
  );
}
