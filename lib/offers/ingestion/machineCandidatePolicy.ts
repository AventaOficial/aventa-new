/**
 * Admisión de candidatos de máquina (MCP) antes de crear la oferta pending.
 *
 * MCP no trae `ParsedOfferMetadata` del extractor de bots, así que S6.1
 * (`evaluateMachineCandidateGate`) no se puede evaluar entero. De S6.1 se reutilizan los
 * controles que no dependen de exigir descuento:
 * - identidad de producto: fuerte (`strongProductFingerprintForUrl`) o, en tiendas sin id
 *   fuerte, la clave `url:` de `resolveIngestionIdentity`, que el índice único
 *   `idx_offers_active_ingestion_identity` deduplica. Con `url:` la memoria negativa no
 *   puede evaluar; la oferta llega a moderación marcada (`identity: 'url_fingerprint'`).
 *   Sin ninguna de las dos, el candidato queda retenido;
 * - precio actual positivo con fuente de página;
 * - título de baja calidad (`isLowQualityTitle`, con la misma configuración de bots);
 * - precio original solo con procedencia explícita de la página (`source_explicit`) y mayor
 *   que el actual (`compareWithListPrice`). Nunca el que declara el bot.
 * Lo que S6.1 añade para descuentos (mínimo de descuento, verificador de score, historial
 * de Price Memory) no aplica a una oportunidad por precio: sin referencia no hay descuento
 * que validar ni que mostrar.
 *
 * La memoria negativa y la extracción completa se aplican antes, en `enqueueHunterOffer`.
 * Ninguna clasificación (despensa u otra) relaja estos controles.
 */
import { strongProductFingerprintForUrl } from '@/lib/offers/findDuplicateOffer';
import { compareWithListPrice } from '@/lib/offers/listPriceComparison';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import type { ExtractedPriceSource, PreparedMachineCandidate } from '@/lib/offers/ingestion/prepareMachineCandidateOffer';

export const MACHINE_CANDIDATE_POLICY_VERSION = 'mcp-candidate-policy-v2';

/** `strong`: ASIN / item id, con memoria negativa. `url_fingerprint`: URL canónica, sin ella. */
export type MachineCandidateIdentity = 'strong' | 'url_fingerprint';

/**
 * `price_opportunity`: compite por precio; no lleva precio de lista ni porcentaje.
 * `list_price_comparison`: la página de la tienda muestra un precio de lista mayor. Se
 * presenta «vs. lista», nunca como ahorro confirmado.
 */
export type MachineOfferAdmissionKind = 'price_opportunity' | 'list_price_comparison';

/** Por qué no se usó un precio de lista. */
export type ReferencePriceDrop = 'absent' | 'no_page_source' | 'not_above_price';

export type MachineCandidateHoldCode = 'NO_STRONG_IDENTITY' | 'PRICE_SOURCE_UNKNOWN';
export type MachineCandidateRejectCode = 'LOW_QUALITY_TITLE';

export type MachineCandidateAdmission =
  | {
      outcome: 'admit';
      kind: MachineOfferAdmissionKind;
      price: number;
      priceSource: ExtractedPriceSource;
      originalPrice: number | null;
      originalPriceProvenance: 'source_explicit' | null;
      referenceDropped: ReferencePriceDrop | null;
      /** Pistas del bot solo para auditoría; nunca se publican como precio. */
      botDeclared: { price: number | null; originalPrice: number | null };
      identity: MachineCandidateIdentity;
      /** Clave de deduplicación: fingerprint fuerte o `url:`. */
      identityKey: string;
    }
  /** Queda para revisión humana en la consola de lotes; no crea oferta. */
  | { outcome: 'hold'; code: MachineCandidateHoldCode }
  /** Terminal: el control equivale a una supresión de S6.1. */
  | { outcome: 'reject'; code: MachineCandidateRejectCode };

export function evaluateMachineCandidateAdmission(input: {
  url: string;
  prepared: Pick<
    PreparedMachineCandidate,
    'title' | 'price' | 'priceSource' | 'originalPrice' | 'originalPriceSource'
  >;
  botDeclared: { price: number | null; originalPrice: number | null };
  isLowQualityTitle: (title: string) => boolean;
}): MachineCandidateAdmission {
  const { prepared } = input;
  const strong = strongProductFingerprintForUrl(input.url);
  const fallback = strong ? null : resolveIngestionIdentity(input.url);
  const identityKey = strong ?? (fallback?.strategy === 'url_fingerprint' ? fallback.key : null);
  if (!identityKey) return { outcome: 'hold', code: 'NO_STRONG_IDENTITY' };
  const identity: MachineCandidateIdentity = strong ? 'strong' : 'url_fingerprint';

  const price = prepared.price;
  if (price == null || !Number.isFinite(price) || price <= 0 || !prepared.priceSource) {
    return { outcome: 'hold', code: 'PRICE_SOURCE_UNKNOWN' };
  }

  if (input.isLowQualityTitle(prepared.title ?? '')) return { outcome: 'reject', code: 'LOW_QUALITY_TITLE' };

  let originalPrice: number | null = null;
  let referenceDropped: ReferencePriceDrop | null = null;
  if (prepared.originalPrice == null) referenceDropped = 'absent';
  else if (!prepared.originalPriceSource) referenceDropped = 'no_page_source';
  else if (!compareWithListPrice(price, prepared.originalPrice)) referenceDropped = 'not_above_price';
  else originalPrice = prepared.originalPrice;

  return {
    outcome: 'admit',
    kind: originalPrice == null ? 'price_opportunity' : 'list_price_comparison',
    price,
    priceSource: prepared.priceSource,
    originalPrice,
    originalPriceProvenance: originalPrice == null ? null : 'source_explicit',
    referenceDropped,
    botDeclared: input.botDeclared,
    identity,
    identityKey,
  };
}
