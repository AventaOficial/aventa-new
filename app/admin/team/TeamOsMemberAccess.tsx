'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type AccessState = {
  has_email_password: boolean;
  email_hint: string;
} | null;

export function TeamOsMemberAccess({ userId }: { userId: string }) {
  const [access, setAccess] = useState<AccessState>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    const { data: { session } } = await createClient().auth.getSession();
    if (!session?.access_token) {
      setLoadError('Sin sesión.');
      return;
    }
    const res = await fetch(`/api/admin/team-os/users/${userId}/access`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setAccess(null);
      setLoadError(typeof body.error === 'string' ? body.error : 'No se pudo cargar acceso.');
      return;
    }
    setAccess({
      has_email_password: Boolean(body.has_email_password),
      email_hint: typeof body.email_hint === 'string' ? body.email_hint : '—',
    });
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: 'recovery_email' | 'generate_temporary') {
    setBusy(true);
    setNote(null);
    try {
      const { data: { session } } = await createClient().auth.getSession();
      if (!session?.access_token) throw new Error('Sin sesión.');
      const res = await fetch(`/api/admin/team-os/users/${userId}/access`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Error');
      if (typeof body.temporary_password === 'string') {
        setNote(`Contraseña (cópiala ahora): ${body.temporary_password}`);
      } else {
        setNote(typeof body.message === 'string' ? body.message : 'Listo.');
      }
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-white/50">Acceso Team OS</h3>
      {loadError ? <p className="text-xs text-rose-300">{loadError}</p> : null}
      {access ? (
        <p className="text-xs text-white/50">
          {access.email_hint} ·{' '}
          {access.has_email_password ? 'Con contraseña' : 'Solo Google / sin clave'}
        </p>
      ) : null}
      {note ? <p className="text-xs text-emerald-300 break-all">{note}</p> : null}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAction('recovery_email')}
          className="rounded-xl border border-white/15 px-3 py-2 text-left text-xs disabled:opacity-50"
        >
          Enviar enlace por correo
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runAction('generate_temporary')}
          className="rounded-xl border border-amber-400/40 px-3 py-2 text-left text-xs text-amber-100 disabled:opacity-50"
        >
          Generar contraseña temporal (una sola vez)
        </button>
      </div>
    </div>
  );
}
