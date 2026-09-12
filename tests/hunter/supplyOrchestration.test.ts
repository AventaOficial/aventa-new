import { afterEach, describe, expect, it } from 'vitest';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import type { ParsedOfferMetadata } from '@/lib/bots/ingest/fetchParsedOfferMetadata';
import { defaultHealthRow } from '@/lib/hunter/healthStore';
import { HUNTER_METRIC_UNIVERSES } from '@/lib/hunter/metricUniverses';
import { DAY_TO_DAY_SOURCES, isDayToDayFlagOn } from '@/lib/hunter/dayToDay';
import {
  allocateSourceSlots,
  assertSupplyInvariants,
  computeGlobalSupplyStatus,
  dedupeSupplyCandidates,
  DEFAULT_SUPPLY_PRIORITY_POLICY,
  resetSupplyOrchestrationMetrics,
  resolveCommunityUrl,
  runSupplyRouter,
  sortSupplySources,
  SUPPLY_SOURCES,
  supplySourceById,
  toSupplyCandidate,
  type SupplySource,
} from '@/lib/hunter/supply';
import { communitySupplySource } from '@/lib/hunter/supply/community';
import { DEAL_VERIFIER_THRESHOLDS } from '@/lib/verifier/thresholds';
import { AUTONOMOUS_POLICY_V1 } from '@/lib/autonomous/policy';

afterEach(() => {
  resetSupplyOrchestrationMetrics();
});

function meta(over: Partial<ParsedOfferMetadata> = {}): ParsedOfferMetadata {
  return {
    canonicalUrl: 'https://www.chedraui.com.mx/te/p',
    title: 'Té 20 sobres',
    store: 'Chedraui',
    imageUrl: 'https://www.chedraui.com.mx/img/te.jpg',
    discountPrice: 40,
    originalPrice: 80,
    discountPercent: 50,
    signals: {
      currentPriceProvenance: 'source_explicit',
      originalPriceProvenance: 'source_explicit',
    },
    ...over,
  };
}

function candidate(opts: {
  url: string;
  sourceId?: SupplySource['id'];
  hunter?: 'env_urls' | 'ml_worker' | 'ml_api_legacy';
  ingest?: 'env_urls' | 'ml_worker' | 'ml_api';
  family?: SupplySource['family'];
  type?: SupplySource['type'];
  precomputedMeta?: ParsedOfferMetadata | null;
}) {
  const sourceId = opts.sourceId ?? 'community';
  return toSupplyCandidate({
    item: {
      url: opts.url,
      source: opts.ingest ?? 'env_urls',
      sourceDetail: sourceId === 'community' ? 'community:paste' : 'machine:test',
      ...(opts.precomputedMeta === null ? {} : { precomputedMeta: opts.precomputedMeta ?? meta({ canonicalUrl: opts.url }) }),
    },
    hunterSourceId: opts.hunter ?? 'env_urls',
    sourceId,
    sourceFamily: opts.family ?? (sourceId === 'community' ? 'community' : 'external_worker'),
    sourceType: opts.type ?? (sourceId === 'community' ? 'community' : 'external_worker'),
  });
}

function fakeSource(over: Partial<SupplySource> & Pick<SupplySource, 'id'>): SupplySource {
  return {
    ...communitySupplySource,
    displayName: over.id,
    family: 'official_api',
    type: 'official_api',
    hunterSourceId: null,
    ingestSourceId: null,
    isEnabled: () => true,
    isConfigured: () => true,
    async collect() {
      return { ok: true, candidates: [] };
    },
    ...over,
  };
}

describe('FASE 10 registry + capabilities', () => {
  it('registry incluye hunter + community + placeholders', () => {
    const ids = SUPPLY_SOURCES.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'ml_api_legacy',
        'ml_worker',
        'community',
        'affiliate_feed',
        'partner',
        'chedraui_mx',
      ]),
    );
    expect(ids).not.toContain('home_depot_mx');
    expect(ids).not.toContain('soriana_mx');
  });

  it('capabilities son metadata, no se asumen solo por type', () => {
    const community = supplySourceById('community')!;
    const feed = supplySourceById('affiliate_feed')!;
    expect(community.capabilities.discovery).toBe(true);
    expect(community.capabilities.affiliate).toBe(false);
    expect(feed.capabilities.discovery).toBe(false);
    expect(feed.capabilities.affiliate).toBe(true);
  });

  it('ninguna source puede bypass / publish / rewards', () => {
    for (const s of SUPPLY_SOURCES) {
      expect(s.canBypassVerifier).toBe(false);
      expect(s.canPublish).toBe(false);
      expect(s.canModifyRewards).toBe(false);
      expect(() => assertSupplyInvariants(s)).not.toThrow();
    }
  });
});

describe('FASE 10 source states', () => {
  it('disabled / not configured / degraded / down / blocked no rompen el router', async () => {
    const cfg = loadBotIngestConfig();
    const now = new Date('2026-09-11T18:00:00Z');
    const disabled = fakeSource({ id: 'env_urls', hunterSourceId: 'env_urls', isEnabled: () => false });
    const unconf = fakeSource({ id: 'amazon_paapi', hunterSourceId: 'amazon_paapi', isConfigured: () => false });
    const down = fakeSource({ id: 'ml_api_legacy', hunterSourceId: 'ml_api_legacy' });
    const open = fakeSource({ id: 'ml_worker', hunterSourceId: 'ml_worker' });
    const health = new Map([
      [
        'ml_api_legacy',
        defaultHealthRow('ml_api_legacy', { status: 'down', enabled: true, breakerState: 'closed' }),
      ],
      [
        'ml_worker',
        defaultHealthRow('ml_worker', {
          status: 'degraded',
          enabled: true,
          breakerState: 'open',
          cooldownUntil: '2026-09-12T00:00:00Z',
        }),
      ],
    ]);
    const out = await runSupplyRouter({
      config: cfg,
      now,
      sources: [disabled, unconf, down, open, communitySupplySource],
      hunterHealth: health,
      communityUrls: [],
    });
    expect(out.runs.find((r) => r.sourceId === 'env_urls')?.skippedReason).toBe('disabled');
    expect(out.runs.find((r) => r.sourceId === 'amazon_paapi')?.skippedReason).toBe('not_configured');
    expect(out.runs.find((r) => r.sourceId === 'ml_api_legacy')?.skippedReason).toBe('down');
    expect(out.runs.find((r) => r.sourceId === 'ml_worker')?.skippedReason).toBe('circuit_open');
    expect(out.persisted).toBe(false);
    expect(out.published).toBe(false);
  });
});

describe('FASE 10 isolation + fallback + budget', () => {
  it('exception de una source no tumba el router', async () => {
    const boom = fakeSource({
      id: 'ml_api_legacy',
      hunterSourceId: 'ml_api_legacy',
      async collect() {
        throw new Error('boom');
      },
    });
    const ok = fakeSource({
      id: 'community',
      family: 'community',
      type: 'community',
      async collect() {
        return { ok: true, candidates: [candidate({ url: 'https://www.chedraui.com.mx/a/p' })] };
      },
    });
    const out = await runSupplyRouter({
      sources: [boom, ok],
      config: loadBotIngestConfig(),
    });
    expect(out.runs.find((r) => r.sourceId === 'ml_api_legacy')?.isolatedFailure).toBe(true);
    expect(out.uniqueCandidates.length).toBe(1);
    expect(out.sourceFailures).toBe(1);
  });

  it('fallback ML API → worker si API falla', async () => {
    const api = fakeSource({
      id: 'ml_api_legacy',
      hunterSourceId: 'ml_api_legacy',
      type: 'official_api',
      async collect() {
        return { ok: false, candidates: [], errorCode: '403' };
      },
    });
    const worker = fakeSource({
      id: 'ml_worker',
      hunterSourceId: 'ml_worker',
      type: 'external_worker',
      async collect() {
        return {
          ok: true,
          candidates: [
            candidate({
              url: 'https://articulo.mercadolibre.com.mx/MLM-2222222222-x-_JM',
              sourceId: 'ml_worker',
              hunter: 'ml_worker',
              ingest: 'ml_worker',
            }),
          ],
        };
      },
    });
    const out = await runSupplyRouter({ sources: [api, worker], config: loadBotIngestConfig() });
    expect(out.runs.find((r) => r.sourceId === 'ml_worker')?.fallbackFrom).toBe('ml_api_legacy');
    expect(out.uniqueCandidates.some((c) => c.sourceId === 'ml_worker')).toBe(true);
  });

  it('budget + fairness: machine no monopoliza; community reservada', () => {
    const machine = fakeSource({ id: 'ml_worker', family: 'external_worker', type: 'external_worker' });
    const incoming = new Map([
      ['ml_worker', 40],
      ['community', 6],
    ]);
    const slots = allocateSourceSlots([machine, communitySupplySource], incoming, {
      ...DEFAULT_SUPPLY_PRIORITY_POLICY,
      maxTotal: 10,
      maxPerSource: 8,
      communityReservedSlots: 4,
    });
    expect(slots.get('community')).toBeGreaterThanOrEqual(4);
    expect((slots.get('ml_worker') ?? 0) + (slots.get('community') ?? 0)).toBeLessThanOrEqual(10);
  });

  it('concurrency de política es 1', () => {
    expect(DEFAULT_SUPPLY_PRIORITY_POLICY.maxConcurrency).toBe(1);
    expect(sortSupplySources([communitySupplySource, fakeSource({ id: 'ml_api_legacy' })], DEFAULT_SUPPLY_PRIORITY_POLICY)[0]?.type).toBe(
      'official_api',
    );
  });
});

describe('FASE 10 community + machine + convergence', () => {
  it('community resuelve ML / Amazon / genérica', () => {
    const ml = resolveCommunityUrl('https://articulo.mercadolibre.com.mx/MLM-1234567890-taladro-_JM');
    expect(ml.ok).toBe(true);
    if (ml.ok) expect(ml.ingestSourceId).toBe('ml_api');
    const amz = resolveCommunityUrl('https://www.amazon.com.mx/dp/B0TESTASIN');
    expect(amz.ok).toBe(true);
    if (amz.ok) expect(amz.ingestSourceId).toBe('amazon_asin');
    const gen = resolveCommunityUrl('https://www.chedraui.com.mx/te/p');
    expect(gen.ok).toBe(true);
    if (gen.ok) expect(gen.ingestSourceId).toBe('env_urls');
    expect(resolveCommunityUrl('not-a-url').ok).toBe(false);
  });

  it('community y machine convergen al mismo IngestItem / dedupe', async () => {
    const url = 'https://articulo.mercadolibre.com.mx/MLM-3333333333-x-_JM';
    const out = await runSupplyRouter({
      config: loadBotIngestConfig(),
      sources: [
        fakeSource({
          id: 'community',
          family: 'community',
          type: 'community',
          async collect() {
            return { ok: true, candidates: [candidate({ url, sourceId: 'community', hunter: 'ml_api_legacy', ingest: 'ml_api' })] };
          },
        }),
        fakeSource({
          id: 'ml_worker',
          family: 'external_worker',
          type: 'external_worker',
          async collect() {
            return {
              ok: true,
              candidates: [candidate({ url, sourceId: 'ml_worker', hunter: 'ml_worker', ingest: 'ml_worker' })],
            };
          },
        }),
      ],
    });
    expect(out.uniqueCandidates.length).toBe(1);
    expect(out.duplicates).toBe(1);
    expect(out.duplicateCandidates.length).toBe(1);
    expect(out.duplicateCandidates[0]?.duplicateReason).toBeTruthy();
    expect(out.uniqueCandidates[0]?.ingestItem.url).toContain('MLM-3333333333');
  });

  it('idempotencia: dos corridas iguales no inventan un segundo unique', async () => {
    const sources: SupplySource[] = [
      fakeSource({
        id: 'community',
        family: 'community',
        type: 'community',
        async collect() {
          return {
            ok: true,
            candidates: [candidate({ url: 'https://www.chedraui.com.mx/arroz/p' })],
          };
        },
      }),
    ];
    const a = await runSupplyRouter({ sources, config: loadBotIngestConfig() });
    const b = await runSupplyRouter({ sources, config: loadBotIngestConfig() });
    expect(a.uniqueCandidates.map((c) => c.canonicalUrl)).toEqual(b.uniqueCandidates.map((c) => c.canonicalUrl));
    expect(a.inserted).toBe(false);
    expect(b.inserted).toBe(false);
  });
});

describe('FASE 10 affiliate / invalid / pipeline', () => {
  it('affiliate ausente sigue siendo supply válido', async () => {
    const out = await runSupplyRouter({
      config: loadBotIngestConfig(),
      sources: [
        fakeSource({
          id: 'community',
          family: 'community',
          type: 'community',
          async collect() {
            return {
              ok: true,
              candidates: [
                candidate({
                  url: 'https://www.chedraui.com.mx/te/p',
                  precomputedMeta: meta({
                    originalPrice: null,
                    discountPercent: 0,
                    signals: { currentPriceProvenance: 'source_explicit', promotionType: '2x1', promotionBoundToProduct: true },
                  }),
                }),
              ],
            };
          },
        }),
      ],
    });
    expect(out.uniqueCandidates[0]?.monetizationStatus).toBe('non_affiliate');
    expect(out.uniqueCandidates[0]?.qualification).toBe('PROMOTION');
    expect(out.published).toBe(false);
  });

  it('candidato inválido no entra', () => {
    expect(resolveCommunityUrl('ftp://x').ok).toBe(false);
  });

  it('qualification + verifier + shadow sin persistir ni publicar', async () => {
    const out = await runSupplyRouter({
      config: loadBotIngestConfig(),
      sources: [
        fakeSource({
          id: 'ml_worker',
          async collect() {
            return {
              ok: true,
              candidates: [
                candidate({
                  url: 'https://articulo.mercadolibre.com.mx/MLM-4444444444-x-_JM',
                  sourceId: 'ml_worker',
                  hunter: 'ml_worker',
                  ingest: 'ml_worker',
                  precomputedMeta: meta({
                    canonicalUrl: 'https://articulo.mercadolibre.com.mx/MLM-4444444444-x-_JM',
                    store: 'Mercado Libre',
                    title: 'Taladro 20V',
                    discountPrice: 799,
                    originalPrice: 999,
                    discountPercent: 20,
                  }),
                }),
              ],
            };
          },
        }),
      ],
    });
    const c = out.uniqueCandidates[0];
    expect(c?.qualification).toBe('VERIFIED_DEAL');
    expect(c?.verifierDecision).toBeTruthy();
    expect(c?.autonomousDecision).toBeTruthy();
    expect(out.verifierBypassed).toBe(false);
    expect(out.rewardsTouched).toBe(false);
    expect(out.persisted).toBe(false);
  });
});

describe('FASE 10 health + contribution + universes', () => {
  it('global supply health', () => {
    expect(
      computeGlobalSupplyStatus({
        machineHealthy: 0,
        machineDegraded: 0,
        machineDown: 2,
        communityAvailable: false,
        verifiedDeals: 0,
        familiesContributing: 0,
      }),
    ).toBe('DOWN');
    expect(
      computeGlobalSupplyStatus({
        machineHealthy: 0,
        machineDegraded: 0,
        machineDown: 2,
        communityAvailable: true,
        verifiedDeals: 0,
        familiesContributing: 1,
      }),
    ).toBe('AT_RISK');
    expect(
      computeGlobalSupplyStatus({
        machineHealthy: 1,
        machineDegraded: 0,
        machineDown: 0,
        communityAvailable: true,
        verifiedDeals: 3,
        familiesContributing: 2,
      }),
    ).toBe('HEALTHY');
  });

  it('contribution usa verified deals, no raw count', async () => {
    const out = await runSupplyRouter({
      config: loadBotIngestConfig(),
      sources: [
        fakeSource({
          id: 'community',
          family: 'community',
          type: 'community',
          async collect() {
            return {
              ok: true,
              candidates: [
                candidate({
                  url: 'https://www.chedraui.com.mx/a/p',
                  precomputedMeta: meta({ canonicalUrl: 'https://www.chedraui.com.mx/a/p' }),
                }),
              ],
            };
          },
        }),
        fakeSource({
          id: 'chedraui_mx',
          family: 'retailer_public',
          type: 'retailer_public',
          async collect() {
            return {
              ok: true,
              candidates: [
                candidate({
                  url: 'https://www.chedraui.com.mx/b/p',
                  sourceId: 'chedraui_mx',
                  family: 'retailer_public',
                  type: 'retailer_public',
                  precomputedMeta: meta({
                    canonicalUrl: 'https://www.chedraui.com.mx/b/p',
                    originalPrice: null,
                    discountPercent: 0,
                    signals: { currentPriceProvenance: 'source_explicit' },
                  }),
                }),
                candidate({
                  url: 'https://www.chedraui.com.mx/c/p',
                  sourceId: 'chedraui_mx',
                  family: 'retailer_public',
                  type: 'retailer_public',
                  precomputedMeta: meta({
                    canonicalUrl: 'https://www.chedraui.com.mx/c/p',
                    originalPrice: null,
                    discountPercent: 0,
                    signals: { currentPriceProvenance: 'source_explicit' },
                  }),
                }),
              ],
            };
          },
        }),
      ],
    });
    expect(out.communityVerified).toBe(1);
    expect(out.machineVerified).toBe(0);
    expect(out.uniqueCandidates.filter((c) => c.sourceId === 'chedraui_mx').length).toBe(2);
  });

  it('universos separados + flags intactos', () => {
    expect(HUNTER_METRIC_UNIVERSES.supplyOrchestration.note).toMatch(/No mezclar/i);
    expect(HUNTER_METRIC_UNIVERSES.supplyOrchestration.note).toMatch(/autonomousPct/i);
    expect(HUNTER_METRIC_UNIVERSES.sourceHealth.persistence).toBe('supabase_hunter_source_health');
    expect(HUNTER_METRIC_UNIVERSES.autonomousShadow.persistence).toBe('process_memory');
    expect(isDayToDayFlagOn('DAY_TO_DAY_CHEDRAUI_ENABLED')).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_BODEGA_ENABLED')).toBe(false);
    expect(isDayToDayFlagOn('DAY_TO_DAY_WALMART_ENABLED')).toBe(false);
    expect(DAY_TO_DAY_SOURCES.every((s) => !s.isEnabled({ config: loadBotIngestConfig(), rotationWave: 0 }))).toBe(
      true,
    );
    expect(loadBotIngestConfig().legacyAutoApproveWriteEnabled).toBe(false);
    expect(DEAL_VERIFIER_THRESHOLDS.absurdDiscountCap).toBe(85);
    expect(AUTONOMOUS_POLICY_V1.minAutoApproveConfidence).toBe(0.7);
  });

  it('dedupe global reutiliza fingerprints', () => {
    const a = candidate({ url: 'https://articulo.mercadolibre.com.mx/MLM-5555555555-x-_JM', sourceId: 'community' });
    const b = candidate({
      url: 'https://articulo.mercadolibre.com.mx/MLM-5555555555-x-_JM?utm_source=x',
      sourceId: 'ml_worker',
      hunter: 'ml_worker',
      ingest: 'ml_worker',
    });
    const { unique, duplicates } = dedupeSupplyCandidates([a, b]);
    expect(unique.length).toBe(1);
    expect(duplicates.length).toBe(1);
  });
});
