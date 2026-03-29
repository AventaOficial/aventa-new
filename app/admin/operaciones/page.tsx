'use client';

import { Suspense } from 'react';
import OperacionesPageContent from '@/app/operaciones/OperacionesPageContent';

export default function AdminOperacionesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
        </div>
      }
    >
      <OperacionesPageContent />
    </Suspense>
  );
}
