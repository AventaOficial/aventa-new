'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type BridgeState = 'loading' | 'login' | 'connecting' | 'success' | 'error';

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage: (
          extensionId: string,
          message: unknown,
          callback?: (response: unknown) => void,
        ) => void;
        lastError?: { message?: string };
      };
    };
  }
}

export default function ExtensionAuthPage() {
  const [state, setState] = useState<BridgeState>('loading');
  const [error, setError] = useState<string | null>(null);
  const extensionId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('ext')?.trim() || ''
      : '';

  useEffect(() => {
    const supabase = createClient();

    const connect = async () => {
      if (!extensionId) {
        setError('Falta el identificador de la extensión. Ábrela de nuevo desde el popup.');
        setState('error');
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !session.refresh_token) {
        setState('login');
        return;
      }

      setState('connecting');

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
      const aventaBase =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
        (typeof window !== 'undefined' ? window.location.origin : 'https://aventaofertas.com');

      const expiresAt =
        session.expires_at != null
          ? session.expires_at * 1000
          : Date.now() + 3600 * 1000;

      const message = {
        type: 'AVENTA_EXTENSION_SESSION',
        session: {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt,
          userId: session.user?.id,
          email: session.user?.email ?? undefined,
        },
        config: {
          aventaBase,
          supabaseUrl,
          supabaseAnonKey,
        },
      };

      const chromeApi = window.chrome?.runtime;
      if (!chromeApi?.sendMessage) {
        setError('No se detectó la extensión de Aventa. Asegúrate de tenerla instalada.');
        setState('error');
        return;
      }

      chromeApi.sendMessage(extensionId, message, (response) => {
        if (chromeApi.lastError) {
          setError('No pudimos conectar con la extensión. Revisa que esté instalada y activa.');
          setState('error');
          return;
        }
        if ((response as { ok?: boolean } | undefined)?.ok) {
          setState('success');
        } else {
          setError('La extensión no confirmó la sesión. Intenta de nuevo.');
          setState('error');
        }
      });
    };

    void connect();
  }, [extensionId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141414] border border-[#e5e5e7] dark:border-[#333] p-8 shadow-lg text-center">
        <h1 className="text-xl font-bold text-[#1d1d1f] dark:text-[#fafafa] mb-2">AVENTA Extensión</h1>

        {state === 'loading' || state === 'connecting' ? (
          <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3]">Conectando tu sesión…</p>
        ) : null}

        {state === 'login' ? (
          <div className="space-y-4">
            <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3]">
              Inicia sesión en Aventa para conectar la extensión.
            </p>
            <Link
              href="/"
              className="inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700"
            >
              Ir a Aventa e iniciar sesión
            </Link>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex w-full items-center justify-center rounded-xl border border-[#e5e5e7] dark:border-[#404040] px-4 py-3 text-sm font-medium text-[#1d1d1f] dark:text-[#fafafa] hover:bg-[#f5f5f7] dark:hover:bg-[#1a1a1a]"
            >
              Ya inicié sesión — conectar
            </button>
            <p className="text-xs text-[#6e6e73] dark:text-[#a3a3a3]">
              Tras iniciar sesión en Aventa, pulsa «Ya inicié sesión — conectar».
            </p>
          </div>
        ) : null}

        {state === 'success' ? (
          <div className="space-y-3">
            <p className="text-sm text-green-600 dark:text-green-400 font-medium">
              Sesión conectada correctamente.
            </p>
            <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3]">
              Ya puedes cerrar esta pestaña y volver a la extensión.
            </p>
          </div>
        ) : null}

        {state === 'error' && error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
