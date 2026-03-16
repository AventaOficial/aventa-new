import { formatPriceMXN } from '@/lib/formatPrice';

export type OfferForShare = {
  title: string;
  discountPrice: number;
  originalPrice: number;
};

/**
 * Genera el texto para compartir una oferta en redes o copiar.
 * Usado en la página de oferta para Telegram, WhatsApp, X y "Copiar mensaje".
 */
export function generateDealShareText(
  offer: OfferForShare,
  dealUrl: string
): string {
  const price = formatPriceMXN(offer.discountPrice);
  const originalPrice =
    offer.originalPrice > 0 ? formatPriceMXN(offer.originalPrice) : null;

  const lines: string[] = [
    '🔥 Ofertaza cazada en Aventa',
    '',
    offer.title.trim() || 'Oferta',
    '',
    `💰 ${price}`,
  ];
  if (originalPrice) {
    lines.push(`📉 Antes: ${originalPrice}`);
    lines.push('');
  }
  lines.push('👉 Ver oferta');
  lines.push(dealUrl);
  lines.push('');
  lines.push('#CazadoEnAventa');

  return lines.join('\n');
}
