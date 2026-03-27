'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const COOKIE_NOTICE_KEY = 'aventa-cookie-notice-v1';

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(COOKIE_NOTICE_KEY);
    if (!saved) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-4 z-40 px-3">
      <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur px-3 py-2.5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            Usamos cookies esenciales y analitica minima para mejorar AVENTA. Puedes ver detalles en{' '}
            <Link href="/privacy" className="font-semibold text-violet-600 dark:text-violet-400 hover:underline">
              Privacidad
            </Link>
            .
          </p>
          <button
            type="button"
            onClick={() => {
              window.localStorage.setItem(COOKIE_NOTICE_KEY, 'accepted');
              setVisible(false);
            }}
            className="shrink-0 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold px-3 py-1.5"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
