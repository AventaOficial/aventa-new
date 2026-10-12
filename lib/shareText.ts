import { presentOfferPrice } from '@/lib/formatPrice';
import { compareWithListPrice } from '@/lib/offers/listPriceComparison';

export type OfferForShare = {
  title: string;
  discountPrice: number;
  originalPrice: number;
  sourceCurrency?: string | null;
};

/**
 * Genera el texto para compartir una oferta en redes o copiar.
 * Usado en la página de oferta para Telegram, WhatsApp, X y "Copiar mensaje".
 */
export function generateDealShareText(
  offer: OfferForShare,
  dealUrl: string
): string {
  const price = presentOfferPrice(offer.discountPrice, offer.sourceCurrency);
  const comparison = compareWithListPrice(offer.discountPrice, offer.originalPrice);
  const originalPrice = comparison ? presentOfferPrice(comparison.listPrice, offer.sourceCurrency) : null;

  const lines: string[] = [
    '🔥 Ofertaza cazada en Aventa',
    '',
    offer.title.trim() || 'Oferta',
    '',
    `💰 ${price}`,
  ];
  if (originalPrice) {
    lines.push(`📉 Precio de lista: ${originalPrice}`);
    lines.push('');
  }
  lines.push('👉 Ver oferta');
  lines.push(dealUrl);
  lines.push('');
  lines.push('#CazadoEnAventa');

  return lines.join('\n');
}
