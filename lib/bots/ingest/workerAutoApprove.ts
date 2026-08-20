import type { ParsedOfferMetadata } from './fetchParsedOfferMetadata';
import type { BotIngestConfig } from './config';
import type { ScoreDecision } from './scoreIngestCandidate';

const ABSURD_DISCOUNT_CAP = 85;

/**
 * Auto-approve para candidatos del worker (card-only):
 * - score clásico alto, o
 * - score “worker” + % descuento sano + imagen + URL de producto.
 */
export function shouldAutoApproveWorkerCandidate(opts: {
  config: BotIngestConfig;
  decision: ScoreDecision;
  scoreTotal: number;
  meta: ParsedOfferMetadata;
}): boolean {
  const { config, decision, scoreTotal, meta } = opts;
  if (!config.autoApproveEnabled) return false;
  if (decision === 'auto_approve') return true;

  if (scoreTotal < config.autoApproveWorkerMinScore) return false;
  if (meta.signals?.suspectedArtificialListPrice) return false;

  const discount = Number(meta.discountPercent ?? 0);
  const minDiscount = Math.max(config.minDiscountPercent, config.autoApproveWorkerMinDiscountPercent);
  if (!Number.isFinite(discount) || discount < minDiscount || discount > ABSURD_DISCOUNT_CAP) {
    return false;
  }

  if (config.autoApproveRequireImage && !meta.imageUrl?.trim()) return false;

  const url = (meta.canonicalUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return false;
  if (/account-verification|login|gz\/account/i.test(url)) return false;

  const title = meta.title?.trim() ?? '';
  if (title.length < 12) return false;

  return true;
}
