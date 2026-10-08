/**
 * Identidad de una contribución humana.
 * Cada oferta aporta varias señales. Dos ofertas son la misma contribución
 * si comparten al menos una señal autoritativa. La clausura es transitiva
 * y se calcula con conjuntos disjuntos por autor, no con un barrido O(n²).
 * Sin señal usable, la oferta queda sola en su id y no se funde con otra.
 */
import { offerUrlFingerprint } from '@/lib/offers/offerUrlFingerprint';

export type ContributionOffer = {
  id: string;
  productFingerprint?: string | null;
  offerUrl?: string | null;
  ingestionIdentityKey?: string | null;
};

export function identityKeys(offer: ContributionOffer): string[] {
  const keys = new Set<string>();
  const fingerprint = offer.productFingerprint?.trim() ?? '';
  const url = offer.offerUrl?.trim() ?? '';
  const urlKey = url ? offerUrlFingerprint(url) : null;
  const ingestion = offer.ingestionIdentityKey?.trim() ?? '';
  if (fingerprint) keys.add(`fp:${fingerprint}`);
  if (urlKey) keys.add(`url:${urlKey}`);
  if (ingestion) keys.add(`ingest:${ingestion}`);
  for (const token of [fingerprint, urlKey ?? '', ingestion]) {
    if (token) keys.add(`sig:${token}`);
  }
  if (keys.size === 0) keys.add(`id:${offer.id}`);
  return [...keys].sort();
}

/** Componente de cada oferta. La raíz es la señal menor, para que el resultado no dependa del orden. */
export function contributionComponents(offers: ContributionOffer[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    const trail: string[] = [];
    while (parent.get(root) !== root) {
      trail.push(root);
      root = parent.get(root) ?? root;
    }
    for (const item of trail) parent.set(item, root);
    return root;
  };
  const ensure = (key: string) => {
    if (!parent.has(key)) parent.set(key, key);
  };
  const union = (left: string, right: string) => {
    const a = find(left);
    const b = find(right);
    if (a === b) return;
    if (a < b) parent.set(b, a);
    else parent.set(a, b);
  };

  for (const offer of offers) {
    const keys = identityKeys(offer);
    for (const key of keys) ensure(key);
    const first = keys[0];
    if (!first) continue;
    for (const key of keys) union(first, key);
  }

  const components = new Map<string, string>();
  for (const offer of offers) {
    const keys = identityKeys(offer);
    const first = keys[0];
    if (first) components.set(offer.id, find(first));
  }
  return components;
}

export function contributionCount(offers: ContributionOffer[]): number {
  return new Set(contributionComponents(offers).values()).size;
}

export function sameContribution(left: ContributionOffer, right: ContributionOffer): boolean {
  const components = contributionComponents([left, right]);
  return components.get(left.id) != null && components.get(left.id) === components.get(right.id);
}
