import { escapeTelegramHtml } from './escape';
import { assertSafeHttpsUrl } from '../security/urls';

export type TelegramRenderOffer = {
  id: string;
  title: string;
  store: string | null;
  price: number | string | null;
  original_price: number | string | null;
  image_url: string | null;
};

export type TelegramRenderResult = {
  text: string;
  imageUrl: string | null;
  parseMode: 'HTML';
};

function formatPrice(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: 0,
  }).format(n);
}

function discountPct(
  price: number | string | null,
  original: number | string | null,
): number | null {
  const p = typeof price === 'number' ? price : Number(price);
  const o = typeof original === 'number' ? original : Number(original);
  if (!Number.isFinite(p) || !Number.isFinite(o) || o <= 0 || p >= o) return null;
  return Math.round(((o - p) / o) * 100);
}

/**
 * Provider-agnostic content → Telegram HTML body.
 * CTA must be the Aventa hop URL (never raw retailer in primary button path).
 */
export function renderTelegramOfferMessage(input: {
  offer: TelegramRenderOffer;
  ctaUrl: string;
  destinationDisplayName?: string | null;
}): TelegramRenderResult {
  const title = escapeTelegramHtml((input.offer.title || 'Oferta').slice(0, 200));
  const store = input.offer.store ? escapeTelegramHtml(String(input.offer.store).slice(0, 80)) : null;
  const price = formatPrice(input.offer.price);
  const original = formatPrice(input.offer.original_price);
  const pct = discountPct(input.offer.price, input.offer.original_price);

  const lines: string[] = [`<b>${title}</b>`];
  if (store) lines.push(`🏪 ${store}`);
  if (price) {
    const priceLine =
      original && pct !== null
        ? `💰 ${escapeTelegramHtml(price)} · <s>${escapeTelegramHtml(original)}</s> (−${pct}%)`
        : `💰 ${escapeTelegramHtml(price)}`;
    lines.push(priceLine);
  }

  const ctaSafe = assertSafeHttpsUrl(input.ctaUrl);
  const cta = ctaSafe.ok ? ctaSafe.url : '';
  if (cta) {
    lines.push('');
    lines.push(`👉 <a href="${escapeTelegramHtml(cta)}">Ver en Aventa</a>`);
  }

  const imageCheck = assertSafeHttpsUrl(input.offer.image_url);
  return {
    text: lines.join('\n'),
    imageUrl: imageCheck.ok ? imageCheck.url : null,
    parseMode: 'HTML',
  };
}
