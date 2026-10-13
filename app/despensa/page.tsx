import { Suspense } from 'react';
import type { Metadata } from 'next';
import ClientLayout from '@/app/ClientLayout';
import DespensaView from './DespensaView';

export const metadata: Metadata = {
  title: 'Mi despensa · AVENTA',
  description: 'Ofertas de productos básicos ordenadas por necesidad, evidencia del precio y precio por unidad.',
};

export default function DespensaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <div className="text-gray-500 dark:text-gray-400">Cargando…</div>
        </div>
      }
    >
      <ClientLayout>
        <DespensaView />
      </ClientLayout>
    </Suspense>
  );
}
