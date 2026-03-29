'use client';

import { Suspense } from 'react';
import TrabajoPageContent from '@/app/operaciones/TrabajoPageContent';

export default function AdminOperacionesTrabajoPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400">Cargando…</p>
        </div>
      }
    >
      <TrabajoPageContent />
    </Suspense>
  );
}
