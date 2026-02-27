'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import Link from 'next/link';

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setError('Configuración incorrecta');
      return;
    }

    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/';
    const safeNext = next.startsWith('/') ? next : '/';

    if (!code) {
      setError('Falta el código de autorización. Vuelve a intentar iniciar sesión.');
      return;
    }

    const supabase = createClient();
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error: err }) => {
        if (err) {
          setError(err.message || 'Error al completar el inicio de sesión');
          return;
        }
        router.replace(safeNext);
      })
      .catch(() => {
        setError('Error al completar el inicio de sesión');
      });
  }, [searchParams, router]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#F5F5F7] dark:bg-[#0a0a0a]">
        <p className="text-red-500 dark:text-red-400 text-center mb-4">{error}</p>
        <Link
          href="/"
          className="text-violet-600 dark:text-violet-400 hover:underline font-medium"
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#F5F5F7] dark:bg-[#0a0a0a]">
      <span className="text-xl font-semibold tracking-[0.2em] text-violet-600 dark:text-violet-400">
        AVENTA
      </span>
      <div className="h-1 w-16 rounded-full bg-[#e5e5e7] dark:bg-[#262626] overflow-hidden mt-3">
        <div className="h-full w-full rounded-full bg-violet-500 dark:bg-violet-400 animate-pulse" />
      </div>
      <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3] mt-3">
        Completando inicio de sesión…
      </p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <span className="text-xl font-semibold tracking-[0.2em] text-violet-600 dark:text-violet-400">
            AVENTA
          </span>
          <div className="h-1 w-16 rounded-full bg-[#e5e5e7] dark:bg-[#262626] overflow-hidden mt-3 animate-pulse" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
