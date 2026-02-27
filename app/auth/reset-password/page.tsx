'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data: { session: s } }) => {
        setReady(true);
        if (!s) setError('Enlace inválido o expirado. Solicita uno nuevo.');
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setLoading(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSuccess(true);
    setTimeout(() => router.replace('/settings'), 1500);
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] dark:bg-[#1d1d1f]">
        <div className="animate-pulse text-[#6e6e73]">Cargando...</div>
      </div>
    );
  }

  if (error && !password) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f5f5f7] dark:bg-[#1d1d1f]">
        <div className="max-w-sm w-full text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <Link
            href="/"
            className="text-violet-600 dark:text-violet-400 hover:underline"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#f5f5f7] dark:bg-[#1d1d1f]">
        <p className="text-green-600 dark:text-green-400">Contraseña actualizada. Redirigiendo...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f5f5f7] dark:bg-[#1d1d1f]">
      <div className="max-w-sm w-full">
        <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#fafafa] mb-2">
          Nueva contraseña
        </h1>
        <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3] mb-6">
          Introduce tu nueva contraseña
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            placeholder="Nueva contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-xl border border-[#d2d2d7] dark:border-[#404040] bg-white dark:bg-[#141414] px-4 py-3 text-[#1d1d1f] dark:text-[#fafafa] placeholder-[#a1a1a6]"
          />
          <input
            type="password"
            placeholder="Confirmar contraseña"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-xl border border-[#d2d2d7] dark:border-[#404040] bg-white dark:bg-[#141414] px-4 py-3 text-[#1d1d1f] dark:text-[#fafafa] placeholder-[#a1a1a6]"
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-violet-700 px-6 py-3.5 font-semibold text-white disabled:opacity-70"
          >
            {loading ? 'Guardando...' : 'Guardar contraseña'}
          </button>
        </form>
        <p className="mt-4 text-center">
          <Link href="/" className="text-sm text-[#6e6e73] dark:text-[#a3a3a3] hover:underline">
            Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
