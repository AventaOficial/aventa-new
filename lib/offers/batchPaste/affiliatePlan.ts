/**
 * Plan de enlace para lote. No aplica tags (eso es servidor).
 * Amazon/ML: tag automático al crear. Otras redes: se pega en la cola al aprobar.
 */

export type BatchAffiliatePlan = 'auto_tag' | 'queue_paste' | 'product_only';

function hostOf(url: string): string {
  try {
    return new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function batchAffiliatePlan(url: string): BatchAffiliatePlan {
  const h = hostOf(url);
  if (!h) return 'product_only';
  if (
    h.includes('amazon.') ||
    h === 'amzn.to' ||
    h.endsWith('.amzn.to') ||
    h === 'a.co' ||
    h.includes('amzlinks.') ||
    h.includes('mercadolibre.') ||
    h === 'meli.la' ||
    h.endsWith('.meli.la')
  ) {
    return 'auto_tag';
  }
  if (
    h.includes('walmart.') ||
    h.includes('aliexpress.') ||
    h.includes('shein.') ||
    h.includes('temu.')
  ) {
    return 'queue_paste';
  }
  return 'product_only';
}

export function batchAffiliatePlanLabel(plan: BatchAffiliatePlan): string {
  if (plan === 'auto_tag') return 'Afiliado al crear (Amazon/ML)';
  if (plan === 'queue_paste') return 'Pegar afiliado en la cola';
  return 'URL de producto';
}
