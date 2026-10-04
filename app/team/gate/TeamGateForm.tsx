'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const inputClass =
  'w-full rounded-xl border border-[#d2d2d7] dark:border-[#404040] bg-white dark:bg-[#141414] px-4 py-3 text-[#1d1d1f] dark:text-[#fafafa] placeholder-[#a1a1a6] dark:placeholder-[#737373]';

function readNext(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('next' in payload)) return null;
  const next = payload.next;
  if (typeof next !== 'string') return null;
  if (!next.startsWith('/team') || next.startsWith('//') || next.includes('..')) return null;
  return next;
}

function readCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('code' in payload)) return null;
  return typeof payload.code === 'string' ? payload.code : null;
}

export function TeamGateForm({
  mode,
  email,
  next,
}: {
  mode: 'login' | 'reauth';
  email: string | null;
  next: string;
}) {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (mode === 'reauth' && !email) {
    return (
      <p className="text-sm text-[#424245] dark:text-[#a1a1a6]">
        Esta cuenta no tiene contraseña de Aventa. Team OS necesita confirmarla.
      </p>
    );
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/team/gate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          password,
          email: mode === 'login' ? address : undefined,
          next,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = readCode(payload);
        if (response.status === 429 || code === 'rate_limited') {
          setError('Demasiados intentos. Espera un momento.');
        } else if (code === 'password_unavailable') {
          setError('Esta cuenta no tiene contraseña de Aventa.');
        } else if (code === 'unavailable') {
          setError('Team OS no está disponible ahora.');
        } else {
          setError('No pudimos confirmar tu identidad.');
        }
        return;
      }
      setPassword('');
      router.replace(readNext(payload) ?? next);
      router.refresh();
    } catch {
      setError('No pudimos confirmar tu identidad.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-[#424245] dark:text-[#a1a1a6]">
        {mode === 'login'
          ? 'Entra con tu cuenta de Aventa. Después podrás ver solo tus equipos.'
          : `Confirma la contraseña de ${email} para entrar a Team OS.`}
      </p>
      {mode === 'login' ? (
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="Email"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          className={inputClass}
        />
      ) : null}
      <input
        type="password"
        name="password"
        autoComplete={mode === 'login' ? 'current-password' : 'current-password'}
        required
        placeholder="Contraseña"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className={inputClass}
      />
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-700 px-6 py-3.5 font-semibold text-white disabled:opacity-70"
      >
        {pending ? 'Espera...' : mode === 'login' ? 'Iniciar sesión' : 'Continuar'}
      </button>
    </form>
  );
}
