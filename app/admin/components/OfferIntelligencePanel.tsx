'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers/AuthProvider';

type PricePayload = {
  status: 'compared' | 'unknown';
  direction: 'better' | 'worse' | 'similar' | null;
  percentage: number | null;
  absoluteDifferenceMinor: string | null;
  reason: string | null;
};

type Candidate = {
  id: string;
  title: string | null;
  store: string | null;
  price: number | null;
  originalPrice: number | null;
  currency: string | null;
  url: string | null;
  createdAt: string | null;
  status: string | null;
};

type Payload = {
  retrieval?: 'ok' | 'unavailable';
  relation: string;
  confidence: number | null;
  signals: { code: string; detail?: string }[];
  price: PricePayload | null;
  incoming: Candidate | null;
  candidate: Candidate | null;
};

function amountLabel(price: number | null, currency: string | null): string {
  if (price == null) return 'Sin precio';
  if (!currency) return `${price} · moneda sin confirmar`;
  return `${price} ${currency}`;
}

function OfferComparison({
  incoming,
  existing,
  direction,
  uncertain,
}: {
  incoming: Candidate | null;
  existing: Candidate;
  direction: 'better' | 'worse' | 'similar' | null;
  uncertain: boolean;
}) {
  const mark = uncertain ? 'Incertidumbre' : direction === 'better' ? 'Mejor precio' : direction === 'worse' ? 'Peor precio' : direction === 'similar' ? 'Mismo precio' : 'Incertidumbre';
  const rows: { label: string; next: string; current: string }[] = [
    { label: 'Producto', next: incoming?.title ?? 'Sin título', current: existing.title ?? 'Sin título' },
    { label: 'Tienda', next: incoming?.store ?? 'Sin dato', current: existing.store ?? 'Sin dato' },
    { label: 'Precio', next: amountLabel(incoming?.price ?? null, incoming?.currency ?? null), current: amountLabel(existing.price, existing.currency) },
    { label: 'Precio original', next: amountLabel(incoming?.originalPrice ?? null, incoming?.currency ?? null), current: amountLabel(existing.originalPrice, existing.currency) },
    { label: 'Moneda', next: incoming?.currency ?? 'Sin dato', current: existing.currency ?? 'Sin dato' },
    { label: 'URL', next: incoming?.url ?? 'Sin dato', current: existing.url ?? 'Sin dato' },
    { label: 'Publicación', next: incoming?.createdAt ?? 'Sin fecha', current: existing.createdAt ?? 'Sin fecha' },
    { label: 'Estado', next: incoming?.status ?? 'Desconocido', current: existing.status ?? 'Desconocido' },
  ];
  return (
    <div className="mt-3 overflow-x-auto">
      <p className="mb-2 text-xs font-semibold">{mark}</p>
      <table className="w-full min-w-[280px] text-left text-xs">
        <thead>
          <tr className="text-black/45 dark:text-white/45">
            <th className="py-1 pr-2 font-medium">Campo</th>
            <th className="py-1 pr-2 font-medium">Nueva</th>
            <th className="py-1 font-medium">Existente</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-black/5 align-top dark:border-white/10">
              <th className="py-1 pr-2 font-medium">{row.label}</th>
              <td className="py-1 pr-2 break-all">{row.next}</td>
              <td className="py-1 break-all">{row.current}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatMinor(minor: string, currency: string): string {
  const hundred = BigInt(100);
  const value = BigInt(minor);
  const pesos = value / hundred;
  const cents = value % hundred;
  return `${pesos.toString()}.${cents.toString().padStart(2, '0')} ${currency}`;
}

export default function OfferIntelligencePanel({ offerId }: { offerId: string }) {
  const { session } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    fetch(`/api/admin/moderation/offer-intelligence?offerId=${encodeURIComponent(offerId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: Payload | null) => {
        if (!cancelled) setData(body);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [offerId, session?.access_token]);

  if (!data) return null;
  if (data.retrieval === 'unavailable') {
    return (
      <section className="border-b border-black/10 px-4 py-3 text-sm dark:border-white/10">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">Inteligencia de oferta</p>
        <p className="mt-1">Datos insuficientes para buscar coincidencias.</p>
      </section>
    );
  }
  if (data.relation === 'NO_MATCH' || !data.candidate) return null;

  const compared = data.price?.status === 'compared' && data.price.absoluteDifferenceMinor && data.candidate.currency;
  const money =
    compared && data.price?.absoluteDifferenceMinor && data.candidate.currency
      ? formatMinor(data.price.absoluteDifferenceMinor, data.candidate.currency)
      : null;
  const headline =
    data.relation === 'SAME_PRODUCT_BETTER_PRICE'
      ? 'Mejor precio'
      : data.relation === 'SAME_PRODUCT_WORSE_PRICE'
        ? 'Ya existe una oferta mejor'
        : data.relation === 'SAME_PRODUCT_SIMILAR_PRICE' || data.relation === 'SAME_OFFER'
          ? 'Precio equivalente'
          : 'Posible producto equivalente';

  return (
    <section className="border-b border-black/10 px-4 py-3 text-sm dark:border-white/10">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-black/50 dark:text-white/50">Inteligencia de oferta</p>
      <p className="mt-1 font-semibold">{headline}</p>
      <p className="mt-1 text-black/70 dark:text-white/70">
        {data.candidate.title ?? 'Oferta existente'}
        {data.candidate.store ? ` · ${data.candidate.store}` : ''}
      </p>
      {money && data.price?.percentage != null ? (
        <p className="mt-1">
          {data.price.direction === 'better'
            ? `La nueva oferta es ${money} / ${data.price.percentage}% más barata.`
            : data.price.direction === 'worse'
              ? `La existente es ${money} / ${data.price.percentage}% más barata.`
              : 'El precio declarado es equivalente.'}
        </p>
      ) : (
        <p className="mt-1 text-black/60 dark:text-white/60">Comparación de precio: datos insuficientes.</p>
      )}
      {data.relation === 'UNCERTAIN_MATCH' && data.confidence != null ? (
        <p className="mt-1">Confianza {Math.round(data.confidence * 100)}%. No es un duplicado confirmado.</p>
      ) : null}
      <p className="mt-1 text-[12px] text-black/50 dark:text-white/50">
        Señales: {data.signals.map((signal) => signal.code).join(', ') || 'ninguna'}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="rounded-lg border px-2 py-1 text-xs" onClick={() => setOpen((value) => !value)}>
          {open ? 'Ocultar comparación' : 'Comparar ofertas'}
        </button>
        {data.candidate.url ? (
          <a className="rounded-lg border px-2 py-1 text-xs" href={data.candidate.url} target="_blank" rel="noreferrer">
            Ver oferta existente
          </a>
        ) : null}
      </div>
      {open ? <OfferComparison incoming={data.incoming} existing={data.candidate} direction={data.price?.direction ?? null} uncertain={data.relation === 'UNCERTAIN_MATCH'} /> : null}
    </section>
  );
}
