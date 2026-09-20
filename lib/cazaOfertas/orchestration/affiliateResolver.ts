/**
 * CazaOfertasss — FASE 4. Port de resolución de affiliate attachment.
 *
 * El dominio (`affiliate.ts`) decide si un attachment es monetizable. Este
 * port sólo responde "¿existe un attachment para esta identidad?". La
 * implementación por defecto delega en `DealStoreAdapter.createAffiliateLink`,
 * que hoy es `unsupported` en ambas tiendas ⇒ resuelve a "sin attachment".
 *
 * Fail-closed: cualquier excepción ⇒ sin attachment, nunca un attachment
 * fabricado. Los secretos se referencian por nombre de env var (contrato de
 * `AffiliateAttachment.affiliateCredentialRef`), nunca por valor.
 */

import { buildTrackingLabel, networkForStore } from '../affiliate';
import type { DealStoreAdapterRegistry } from '../stores/registry';
import type { AffiliateAttachment, CazaResult, DealIdentity, IsoTimestamp } from '../types';
import { failResult } from '../types';

export interface AffiliateResolveInput {
  readonly identity: DealIdentity;
  readonly dealId: string;
  readonly canonicalUrl: string;
  readonly now: IsoTimestamp;
}

export interface AffiliateAttachmentResolver {
  resolve(input: AffiliateResolveInput): Promise<CazaResult<AffiliateAttachment>>;
}

/** Resolver que nunca monetiza. Útil como default explícito y en tests. */
export function createNullAffiliateResolver(): AffiliateAttachmentResolver {
  return {
    async resolve() {
      return failResult(['affiliate.resolver_null']);
    },
  };
}

/**
 * Resolver basado en los adapters de tienda registrados. Mientras
 * `createAffiliateLink` sea `unsupported`, devuelve el reason del adapter.
 */
export function createStoreAdapterAffiliateResolver(
  registry: DealStoreAdapterRegistry
): AffiliateAttachmentResolver {
  return {
    async resolve(input) {
      const adapter = registry[input.identity.store];
      if (!adapter) return failResult([`affiliate.store_not_registered:${input.identity.store}`]);
      if (adapter.capabilities.createAffiliateLink !== 'supported') {
        return failResult([
          `affiliate.capability_unsupported:${input.identity.store}:${adapter.capabilities.createAffiliateLink}`,
        ]);
      }
      const label = buildTrackingLabel(
        input.dealId,
        networkForStore(input.identity.store),
        input.now
      );
      if (!label.ok) return failResult(label.reasons);
      return adapter.createAffiliateLink({
        canonicalUrl: input.canonicalUrl,
        dealId: input.dealId,
        trackingLabel: label.value,
      });
    },
  };
}
