import { Suspense } from 'react';
import ClientLayout from '@/app/ClientLayout';
import DescubreGuide from './DescubreGuide';

export default function DescubrePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <div className="text-gray-500 dark:text-gray-400">Cargando…</div>
        </div>
      }
    >
      <ClientLayout>
        <DescubreGuide />
      </ClientLayout>
    </Suspense>
  );
}
