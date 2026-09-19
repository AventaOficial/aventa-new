/**
 * CazaOfertasss — FASE 0. Contratos de identidad canónica y deduplicación.
 */

import { describe, expect, it } from 'vitest';

import {
  buildDealCandidate,
  buildDealIdentity,
  createInMemoryDealCandidateRepository,
  mergeDealCandidate,
  normalizeProductUrl,
  stableHash,
  upsertDealCandidate,
  type DealCandidate,
} from '@/lib/cazaOfertas';

import {
  AMAZON_CANONICAL_URL,
  AMAZON_RAW_URL,
  ML_CANONICAL_URL,
  ML_RAW_URL,
  NOW,
  amazonAffiliate,
  amazonDraft,
  mercadoLibreDraft,
  strongEvidence,
} from './fixtures';

function candidate(draft: unknown = amazonDraft()): DealCandidate {
  const r = buildDealCandidate(draft, { now: NOW, affiliate: amazonAffiliate() });
  if (!r.ok) throw new Error(`fixture inválido: ${r.reasons.join(', ')}`);
  return r.value;
}

describe('normalizeProductUrl', () => {
  it('canoniza host, elimina www, fragmento y params de tracking', () => {
    const r = normalizeProductUrl(`${AMAZON_RAW_URL}#reviews`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.url).toBe(AMAZON_CANONICAL_URL);
    expect(r.value.store).toBe('amazon_mx');
  });

  it('ordena los params restantes para que la clave sea estable', () => {
    const a = normalizeProductUrl('https://amazon.com.mx/dp/B08N5WRWNW?b=2&a=1');
    const b = normalizeProductUrl('https://amazon.com.mx/dp/B08N5WRWNW?a=1&b=2');
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.url).toBe(b.value.url);
  });

  it('rechaza protocolos no https y credenciales embebidas', () => {
    expect(normalizeProductUrl('http://amazon.com.mx/dp/B08N5WRWNW').ok).toBe(false);
    expect(normalizeProductUrl('javascript:alert(1)').ok).toBe(false);
    expect(normalizeProductUrl('https://user:pass@amazon.com.mx/dp/B08N5WRWNW').ok).toBe(false);
  });

  it('rechaza input malformado sin lanzar', () => {
    for (const raw of [null, undefined, 42, {}, '', 'no-es-url']) {
      expect(normalizeProductUrl(raw).ok, `esperaba rechazar ${String(raw)}`).toBe(false);
    }
  });
});

describe('buildDealIdentity', () => {
  it('prefiere store + externalProductId extraído del URL de Amazon', () => {
    const r = buildDealIdentity({ store: 'amazon_mx', url: AMAZON_RAW_URL });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.strategy).toBe('external_product_id');
    expect(r.value.externalProductId).toBe('B08N5WRWNW');
    expect(r.value.key).toBe('amazon_mx:pid:B08N5WRWNW');
  });

  it('extrae el id de catálogo de Mercado Libre', () => {
    const r = buildDealIdentity({ store: 'mercadolibre_mx', url: ML_RAW_URL });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.externalProductId).toBe('MLM1234567890');
    expect(r.value.normalizedUrl).toBe(ML_CANONICAL_URL);
  });

  it('extrae el id de listing MLM-... de Mercado Libre', () => {
    const r = buildDealIdentity({
      store: 'mercadolibre_mx',
      url: 'https://articulo.mercadolibre.com.mx/MLM-987654321-audifonos-geniales-_JM',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.externalProductId).toBe('MLM987654321');
  });

  it('cae al fallback de URL canónica cuando no hay id extraíble', () => {
    const url = 'https://mercadolibre.com.mx/ofertas/pagina-sin-id';
    const r = buildDealIdentity({ store: 'mercadolibre_mx', url });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.strategy).toBe('canonical_url');
    expect(r.value.externalProductId).toBeNull();
    expect(r.value.key).toBe(`mercadolibre_mx:url:${stableHash(url)}`);
  });

  it('el título nunca participa en la identidad', () => {
    const a = candidate(amazonDraft({ title: 'Audífonos geniales' }));
    const b = candidate(amazonDraft({ title: 'OFERTAZA!!! audífonos 🔥🔥🔥' }));
    expect(a.identity.key).toBe(b.identity.key);
    expect(a.id).toBe(b.id);
  });

  it('rechaza host que no corresponde a la tienda declarada', () => {
    const r = buildDealIdentity({ store: 'amazon_mx', url: ML_RAW_URL });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reasons[0]).toContain('identity.store_host_mismatch');
  });

  it('rechaza hosts no permitidos', () => {
    const r = buildDealIdentity({ store: 'amazon_mx', url: 'https://amazon-mx.example.com/dp/B08N5WRWNW' });
    expect(r.ok).toBe(false);
  });

  it('dos tiendas con el mismo id externo son identidades distintas', () => {
    const amazon = buildDealIdentity({ store: 'amazon_mx', url: AMAZON_RAW_URL });
    const ml = buildDealIdentity({
      store: 'mercadolibre_mx',
      url: ML_RAW_URL,
      externalProductId: 'B08N5WRWNW',
    });
    expect(amazon.ok && ml.ok).toBe(true);
    if (!amazon.ok || !ml.ok) return;
    expect(amazon.value.key).not.toBe(ml.value.key);
  });
});

describe('mergeDealCandidate', () => {
  it('primera detección crea', () => {
    const outcome = mergeDealCandidate(null, candidate());
    expect(outcome.action).toBe('created');
    expect(outcome.candidate.revision).toBe(1);
  });

  it('re-detección idéntica no crea una oferta nueva', () => {
    const existing = candidate();
    const outcome = mergeDealCandidate(existing, candidate());
    expect(outcome.action).toBe('unchanged');
    expect(outcome.candidate.id).toBe(existing.id);
    expect(outcome.candidate.revision).toBe(1);
    expect(outcome.changedFields).toEqual([]);
  });

  it('cambio de precio actualiza en lugar de duplicar', () => {
    const existing = candidate();
    const cheaper = candidate(
      amazonDraft({ currentPrice: 1799, evidence: strongEvidence({ currentPrice: 1799 }) })
    );
    const outcome = mergeDealCandidate(existing, cheaper);
    expect(outcome.action).toBe('updated');
    expect(outcome.candidate.id).toBe(existing.id);
    expect(outcome.candidate.revision).toBe(2);
    expect(outcome.candidate.firstSeenAt).toBe(existing.firstSeenAt);
    expect(outcome.changedFields).toContain('currentPrice');
    expect(outcome.changedFields).toContain('discountPercent');
  });

  it('cambio de affiliate URL actualiza sin duplicar', () => {
    const existing = candidate();
    const retagged = buildDealCandidate(amazonDraft(), {
      now: NOW,
      affiliate: amazonAffiliate({
        affiliateUrl: 'https://www.amazon.com.mx/dp/B08N5WRWNW?tag=cazaofertasss-21',
      }),
    });
    expect(retagged.ok).toBe(true);
    if (!retagged.ok) return;
    const outcome = mergeDealCandidate(existing, retagged.value);
    expect(outcome.action).toBe('updated');
    expect(outcome.candidate.id).toBe(existing.id);
    expect(outcome.changedFields).toContain('affiliateUrl');
  });

  it('un retitulado no cuenta como cambio material', () => {
    const existing = candidate();
    const outcome = mergeDealCandidate(existing, candidate(amazonDraft({ title: 'Otro título' })));
    expect(outcome.action).toBe('unchanged');
  });

  it('nunca fusiona identidades distintas', () => {
    const amazon = candidate();
    const ml = buildDealCandidate(mercadoLibreDraft(), { now: NOW, affiliate: null });
    expect(ml.ok).toBe(true);
    if (!ml.ok) return;
    const outcome = mergeDealCandidate(amazon, ml.value);
    expect(outcome.action).toBe('created');
    expect(outcome.candidate.id).toBe(ml.value.id);
  });
});

describe('upsertDealCandidate sobre el repositorio in-memory', () => {
  it('re-detectar el mismo producto cuatro veces deja un solo registro', async () => {
    const repo = createInMemoryDealCandidateRepository();

    const first = await upsertDealCandidate(repo, candidate());
    expect(first.action).toBe('created');

    const same = await upsertDealCandidate(repo, candidate());
    expect(same.action).toBe('unchanged');

    const cheaper = await upsertDealCandidate(
      repo,
      candidate(amazonDraft({ currentPrice: 1799, evidence: strongEvidence({ currentPrice: 1799 }) }))
    );
    expect(cheaper.action).toBe('updated');

    const cheaperAgain = await upsertDealCandidate(
      repo,
      candidate(amazonDraft({ currentPrice: 1699, evidence: strongEvidence({ currentPrice: 1699 }) }))
    );
    expect(cheaperAgain.action).toBe('updated');
    expect(cheaperAgain.candidate.revision).toBe(3);

    expect(repo.size()).toBe(1);
  });

  it('el listado exige límite y devuelve cursor estable', async () => {
    const repo = createInMemoryDealCandidateRepository();
    await upsertDealCandidate(repo, candidate());
    const page = await repo.listByStatus('PUBLICATION_READY', 10);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });
});
