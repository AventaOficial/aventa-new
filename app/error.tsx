'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 text-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
      <p className="text-6xl font-bold text-violet-600 dark:text-violet-400 mb-2">Oops</p>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        Algo salió mal
      </h1>
      <p className="text-gray-500 dark:text-gray-400 mb-8 max-w-md">
        Ocurrió un error inesperado. Intenta de nuevo o vuelve al inicio.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-medium transition-colors"
        >
          Intentar de nuevo
        </button>
        <a
          href="/"
          className="px-6 py-3 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium transition-colors"
        >
          Ir al inicio
        </a>
      </div>
    </div>
  );
}
