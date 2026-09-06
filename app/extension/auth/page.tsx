'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { runExtensionAuthBridge } from '@/lib/extension/allowedExtensionIds';

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
      const chromeApi = window.chrome?.runtime;

      const result = await runExtensionAuthBridge({
        extensionId,
        getSession: async () => {
          const { data } = await supabase.auth.getSession();
          return data.session;
        },
        sendMessage: (id, message) =>
          new Promise((resolve) => {
            if (!chromeApi?.sendMessage) {
              resolve(null);
              return;
            }
            chromeApi.sendMessage(id, message, (response) => {
              if (chromeApi.lastError) {
                resolve(null);
                return;
              }
              resolve((response as { ok?: boolean } | undefined) ?? null);
            });
          }),
        config: {
          aventaBase:
            process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
            (typeof window !== 'undefined' ? window.location.origin : 'https://aventaofertas.com'),
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
          supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
        },
      });

      if (result.status === 'blocked') {
        if (result.reason === 'missing_ext') {
          setError('Falta el identificador de la extensión. Ábrela de nuevo desde el popup.');
        } else {
          setError(
            'Esta extensión no está autorizada para conectar con Aventa. Usa la extensión oficial.',
          );
        }
        setState('error');
        return;
      }

      if (result.status === 'login') {
        setState('login');
        return;
      }

      if (result.status === 'success') {
        setState('success');
        return;
      }

      if (result.status === 'no_chrome' || result.status === 'send_failed') {
        setError('No pudimos conectar con la extensión. Revisa que esté instalada y activa.');
        setState('error');
        return;
      }

      setError('La extensión no confirmó la sesión. Intenta de nuevo.');
      setState('error');
    };

    setState('connecting');
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
