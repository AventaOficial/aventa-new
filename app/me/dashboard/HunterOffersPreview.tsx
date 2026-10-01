'use client';

import Link from 'next/link';

type PreviewOffer = {
  id: string;
  title: string;
  dealStatus: 'pending' | 'approved' | 'rejected' | 'expired';
};

const STATUS_LABEL: Record<PreviewOffer['dealStatus'], string> = {
  approved: 'Activa',
  pending: 'En revisión',
  rejected: 'Rechazada',
  expired: 'Expirada',
};

type HunterOffersPreviewProps = {
  offers: PreviewOffer[];
};

export default function HunterOffersPreview({ offers }: HunterOffersPreviewProps) {
  const preview = offers.slice(0, 3);

  return (
    <section aria-label="Tus ofertas" className="rounded-3xl border border-gray-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#121214]">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Ofertas</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-500">Un vistazo. El listado completo está aparte.</p>
        </div>
        <Link href="/me/ofertas" className="rounded-md text-xs font-medium text-violet-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 dark:text-violet-400">
          Ver mis ofertas
        </Link>
      </div>
      {preview.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600 dark:text-zinc-300">Nada publicado. ¿Cazamos una oferta?</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 dark:divide-zinc-800">
          {preview.map((offer) => (
            <li key={offer.id} className="flex items-center justify-between gap-3 py-3">
              <p className="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-white">{offer.title}</p>
              <span className="shrink-0 text-xs text-gray-500 dark:text-zinc-400">{STATUS_LABEL[offer.dealStatus]}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
