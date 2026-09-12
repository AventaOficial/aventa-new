import type { SupplyPriorityPolicy, SupplySource, SupplySourceType } from './types';

/** Orden de procesamiento. No salta verifier. Community no se penaliza: tiene cupo reservado. */
export const DEFAULT_SUPPLY_PRIORITY_POLICY: SupplyPriorityPolicy = {
  typeOrder: [
    'official_api',
    'affiliate_feed',
    'external_worker',
    'retailer_public',
    'user_submission',
    'community',
    'partner',
    'future',
  ],
  communityReservedSlots: 4,
  maxPerSource: 8,
  maxTotal: 24,
  maxConcurrency: 1,
};

export function mergeSupplyPriorityPolicy(
  over?: Partial<SupplyPriorityPolicy>,
): SupplyPriorityPolicy {
  return {
    ...DEFAULT_SUPPLY_PRIORITY_POLICY,
    ...over,
    typeOrder: over?.typeOrder ?? DEFAULT_SUPPLY_PRIORITY_POLICY.typeOrder,
    maxConcurrency: 1,
  };
}

export function typeRank(type: SupplySourceType, policy: SupplyPriorityPolicy): number {
  const i = policy.typeOrder.indexOf(type);
  return i === -1 ? policy.typeOrder.length : i;
}

/** Determinista: tipo según política, luego id. Sin Math.random. */
export function sortSupplySources(
  sources: SupplySource[],
  policy: SupplyPriorityPolicy,
): SupplySource[] {
  return [...sources].sort(
    (a, b) => typeRank(a.type, policy) - typeRank(b.type, policy) || a.id.localeCompare(b.id),
  );
}

/**
 * Reparte cupos. Reserva slots de community para evitar starvation.
 * Machine no puede monopolizar el total.
 */
export function allocateSourceSlots(
  sources: SupplySource[],
  incoming: Map<string, number>,
  policy: SupplyPriorityPolicy,
): Map<string, number> {
  const out = new Map<string, number>();
  const community = sources.find((s) => s.id === 'community');
  const communityIncoming = community ? incoming.get(community.id) ?? 0 : 0;
  const reserved = Math.min(policy.communityReservedSlots, communityIncoming, policy.maxTotal);
  let remaining = policy.maxTotal - reserved;

  const ordered = sortSupplySources(sources, policy);
  for (const src of ordered) {
    if (src.id === 'community') continue;
    const want = Math.min(policy.maxPerSource, src.limits.maxCandidates, incoming.get(src.id) ?? 0);
    const give = Math.min(want, remaining);
    out.set(src.id, give);
    remaining -= give;
  }

  if (community) {
    const want = Math.min(
      policy.maxPerSource,
      community.limits.maxCandidates,
      communityIncoming,
      reserved + remaining,
    );
    out.set(community.id, want);
  }
  return out;
}
