import Link from 'next/link';
import { ArrowLeft, BowArrow } from 'lucide-react';
import TrustedHuntersSection from '../TrustedHuntersSection';

export default function AdminCazadoresPage() {
  return (
    <div className="space-y-6 pb-12 max-w-3xl">
      <header>
        <Link
          href="/admin/owner"
          className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Owner Dashboard
        </Link>
        <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-violet-600 dark:text-violet-400">
          Contenido
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1D1D1F] dark:text-gray-100 flex items-center gap-2">
          <BowArrow className="h-8 w-8 text-violet-600 dark:text-violet-400" />
          Cazadores de confianza
        </h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-xl">
          Tu equipo de subida: publican ofertas al instante, sin pasar por la cola de moderación. También aplica si
          alcanzan reputación nivel 3 por mérito.
        </p>
      </header>
      <TrustedHuntersSection />
    </div>
  );
}
