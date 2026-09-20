/**
 * CazaOfertasss — FASE 3.2. Tracking & attribution readiness contracts.
 */

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  EMPTY_PUBLICATION_METRICS,
  assertAttributionCandidateNotInvented,
  assertCazaOfertasMoneyUntouched,
  buildTrackingIdentity,
  createInMemoryTrackingRegistry,
  createManualImportReadinessSource,
  createUnsupportedProviderReportReconciliation,
  derivePublicationRevenueMetrics,
  emptyPublicationRevenueMetrics,
  isEmptyPublicationMetrics,
  registerTrackingIdentity,
  resetManualImportFormatSupportForTests,
  resolveAttributionCandidate,
  trackingIdentityKey,
  buildManualImportEnvelope,
  acknowledgeManualImportFormatSupport,
  CAZAOFERTAS_AVENTA_BOUNDARY,
} from '@/lib/cazaOfertas';

const NOW = '2026-09-19T18:00:00.000Z';
const PUB_A =
  'caza_amazon_mx_aaaa1111|amazon_associates_mx|@cazaofertasss|caza_track_aaaa_20260919';
const PUB_B =
  'caza_amazon_mx_bbbb2222|amazon_associates_mx|@cazaofertasss|caza_track_bbbb_20260919';
const LABEL = 'caza_track_aaaa_20260919';

function baseIdentity(
  overrides: Partial<Parameters<typeof buildTrackingIdentity>[0]> = {}
) {
  return buildTrackingIdentity({
    provider: 'amazon_associates_mx',
    trackingLabel: LABEL,
    publicationId: PUB_A,
    publicationRevision: 1,
    channel: '@cazaofertasss',
    campaign: 'telegram_canary',
    experiment: null,
    registeredAt: NOW,
    ...overrides,
  });
}

describe('FASE 3.2 — TrackingIdentity determinista', () => {
  it('misma entrada ⇒ misma identityKey', () => {
    const a = baseIdentity();
    const b = baseIdentity();
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.identityKey).toBe(b.value.identityKey);
    expect(a.value.identityKey).toBe(
      trackingIdentityKey({
        provider: 'amazon_associates_mx',
        trackingLabel: LABEL,
        publicationId: PUB_A,
        publicationRevision: 1,
        channel: '@cazaofertasss',
        campaign: 'telegram_canary',
        experiment: null,
      })
    );
  });

  it('different revision ⇒ distinta identityKey; same publication replayable', async () => {
    const registry = createInMemoryTrackingRegistry();
    const r1 = await registerTrackingIdentity(registry, {
      provider: 'amazon_associates_mx',
      trackingLabel: LABEL,
      publicationId: PUB_A,
      publicationRevision: 1,
      channel: '@cazaofertasss',
      campaign: 'telegram_canary',
      registeredAt: NOW,
    });
    const replay = await registerTrackingIdentity(registry, {
      provider: 'amazon_associates_mx',
      trackingLabel: LABEL,
      publicationId: PUB_A,
      publicationRevision: 1,
      channel: '@cazaofertasss',
      campaign: 'telegram_canary',
      registeredAt: NOW,
    });
    const r2 = await registerTrackingIdentity(registry, {
      provider: 'amazon_associates_mx',
      trackingLabel: LABEL,
      publicationId: PUB_A,
      publicationRevision: 2,
      channel: '@cazaofertasss',
      campaign: 'telegram_canary',
      registeredAt: NOW,
    });
    expect(r1.ok && r1.value.registered).toBe(true);
    expect(replay.ok && replay.value.duplicate).toBe(true);
    expect(r2.ok && r2.value.registered).toBe(true);
    expect(registry.size()).toBe(2);
  });

  it('different campaign ⇒ distinta identity (misma publication puede tener varias observations)', async () => {
    const registry = createInMemoryTrackingRegistry();
    await registerTrackingIdentity(registry, {
      provider: 'mercadolibre_affiliates',
      trackingLabel: 'caza_ml_camp_a_001',
      publicationId: PUB_A,
      publicationRevision: 1,
      channel: '@cazaofertasss',
      campaign: 'camp_a',
      registeredAt: NOW,
    });
    await registerTrackingIdentity(registry, {
      provider: 'mercadolibre_affiliates',
      trackingLabel: 'caza_ml_camp_b_001',
      publicationId: PUB_A,
      publicationRevision: 1,
      channel: '@cazaofertasss',
      campaign: 'camp_b',
      registeredAt: NOW,
    });
    const list = await registry.listByPublicationId(PUB_A, 10);
    expect(list).toHaveLength(2);
  });

  it('same tracking label registrado dos veces (replay) no duplica', async () => {
    const registry = createInMemoryTrackingRegistry();
    const input = {
      provider: 'amazon_associates_mx' as const,
      trackingLabel: LABEL,
      publicationId: PUB_A,
      publicationRevision: 1,
      channel: '@cazaofertasss',
      campaign: 'telegram_canary',
      registeredAt: NOW,
    };
    await registerTrackingIdentity(registry, input);
    const again = await registerTrackingIdentity(registry, input);
    expect(again.ok && again.value.duplicate).toBe(true);
    const resolved = await registry.resolveByTrackingLabel(LABEL);
    expect(resolved.matches).toHaveLength(1);
  });
});

describe('FASE 3.2 — AttributionCandidate', () => {
  it('unknown attribution sin registry', async () => {
    const registry = createInMemoryTrackingRegistry();
    const c = await resolveAttributionCandidate({
      trackingLabel: 'caza_missing_label_01',
      registry,
    });
    expect(c.status).toBe('UNKNOWN');
    expect(c.publicationId).toBeNull();
    expect(assertAttributionCandidateNotInvented(c).ok).toBe(true);
  });

  it('unknown sin tracking label', async () => {
    const registry = createInMemoryTrackingRegistry();
    const c = await resolveAttributionCandidate({ trackingLabel: null, registry });
    expect(c.status).toBe('UNKNOWN');
  });

  it('KNOWN con exact match', async () => {
    const registry = createInMemoryTrackingRegistry();
    await registerTrackingIdentity(registry, {
      provider: 'amazon_associates_mx',
      trackingLabel: LABEL,
      publicationId: PUB_A,
      publicationRevision: 1,
      channel: '@cazaofertasss',
      campaign: 'telegram_canary',
      registeredAt: NOW,
    });
    const c = await resolveAttributionCandidate({
      trackingLabel: LABEL,
      registry,
      dealIdByPublicationId: new Map([[PUB_A, 'caza_amazon_mx_aaaa1111']]),
    });
    expect(c.status).toBe('KNOWN');
    expect(c.publicationId).toBe(PUB_A);
    expect(c.dealId).toBe('caza_amazon_mx_aaaa1111');
  });

  it('AMBIGUOUS same tracking label → two publications', async () => {
    const registry = createInMemoryTrackingRegistry();
    const shared = 'caza_shared_label_01';
    await registerTrackingIdentity(registry, {
      provider: 'amazon_associates_mx',
      trackingLabel: shared,
      publicationId: PUB_A,
      publicationRevision: 1,
      channel: '@cazaofertasss',
      campaign: 'camp_x',
      registeredAt: NOW,
    });
    await registerTrackingIdentity(registry, {
      provider: 'amazon_associates_mx',
      trackingLabel: shared,
      publicationId: PUB_B,
      publicationRevision: 1,
      channel: '@cazaofertasss',
      campaign: 'camp_x',
      registeredAt: NOW,
    });
    const c = await resolveAttributionCandidate({ trackingLabel: shared, registry });
    expect(c.status).toBe('AMBIGUOUS');
    expect(c.publicationId).toBeNull();
    expect(c.conflictPublicationIds).toHaveLength(2);
  });

  it('CONFLICT when provider reference prior attribution disagrees', async () => {
    const registry = createInMemoryTrackingRegistry();
    await registerTrackingIdentity(registry, {
      provider: 'amazon_associates_mx',
      trackingLabel: LABEL,
      publicationId: PUB_A,
      publicationRevision: 1,
      channel: '@cazaofertasss',
      campaign: 'telegram_canary',
      registeredAt: NOW,
    });
    const c = await resolveAttributionCandidate({
      trackingLabel: LABEL,
      registry,
      priorAttribution: {
        providerExternalReference: 'ORDER-999',
        publicationId: PUB_B,
      },
    });
    expect(c.status).toBe('CONFLICT');
    expect(c.publicationId).toBeNull();
    expect(c.conflictPublicationIds).toContain(PUB_A);
    expect(c.conflictPublicationIds).toContain(PUB_B);
  });
});

describe('FASE 3.2 — null metrics', () => {
  it('EMPTY metrics all null, never zeros', () => {
    expect(isEmptyPublicationMetrics(EMPTY_PUBLICATION_METRICS)).toBe(true);
    for (const [k, v] of Object.entries(EMPTY_PUBLICATION_METRICS)) {
      expect(v, k).toBeNull();
    }
  });

  it('derive without attributed events ⇒ all null', () => {
    const view = derivePublicationRevenueMetrics({
      publicationId: PUB_A,
      events: [],
      attributions: [],
      derivedAt: NOW,
    });
    expect(view).toEqual(emptyPublicationRevenueMetrics(PUB_A, NOW));
    expect(view.clicks).toBeNull();
    expect(view.orders).toBeNull();
    expect(view.commission).toBeNull();
  });
});

describe('FASE 3.2 — concurrent resolution', () => {
  it('100 concurrent resolve + register are race-safe', async () => {
    const registry = createInMemoryTrackingRegistry();
    await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        registerTrackingIdentity(registry, {
          provider: 'amazon_associates_mx',
          trackingLabel: `caza_conc_${String(i).padStart(3, '0')}`,
          publicationId: PUB_A,
          publicationRevision: 1,
          channel: '@cazaofertasss',
          campaign: 'concurrent',
          registeredAt: NOW,
        })
      )
    );
    expect(registry.size()).toBe(100);

    const resolves = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        registry.resolveByTrackingLabel(`caza_conc_${String(i).padStart(3, '0')}`)
      )
    );
    expect(resolves.every((r) => r.matches.length === 1)).toBe(true);
  });
});

describe('FASE 3.2 — provider report + manual import readiness', () => {
  it('provider reconciliation stub fails closed', async () => {
    const port = createUnsupportedProviderReportReconciliation();
    const r = await port.reconcile({
      raw: {
        provider: 'mercadolibre_affiliates',
        externalReference: 'X-1',
        eventType: 'ORDER',
        occurredAt: NOW,
        currency: 'MXN',
        grossAmount: 1,
        commissionAmount: null,
        status: 'PENDING',
        productReference: null,
        externalProductId: null,
        trackingIdentifier: null,
        sourceBatchId: 'batch_x',
        sourceMetadata: {},
        reversesExternalReference: null,
        receivedAt: NOW,
      },
      recordedAt: NOW,
    });
    expect(r.ok).toBe(false);
  });

  it('manual import without registered parser rejects; ledger untouched', async () => {
    resetManualImportFormatSupportForTests();
    const src = createManualImportReadinessSource('csv');
    const envelope = buildManualImportEnvelope({
      batchId: 'batch_manual_1',
      provider: 'amazon_associates_mx',
      format: 'csv',
      receivedAt: NOW,
      sourceLabel: 'future_official_csv',
      opaqueBody: 'not_a_real_schema',
    });
    const r = await src.project(envelope);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(',')).toContain('parser_not_registered');

    acknowledgeManualImportFormatSupport('csv');
    const r2 = await src.project(envelope);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.records).toEqual([]);
    resetManualImportFormatSupportForTests();
  });
});

describe('FASE 3.2 — isolation', () => {
  it('Aventa money path untouched', () => {
    expect(() => assertCazaOfertasMoneyUntouched()).not.toThrow();
    expect(CAZAOFERTAS_AVENTA_BOUNDARY.writesAventaRewards).toBe(false);
  });

  it('tracking modules do not import Aventa money paths', () => {
    const roots = [
      path.resolve(__dirname, '../../lib/cazaOfertas/tracking'),
      path.resolve(__dirname, '../../lib/cazaOfertas/revenue'),
    ];
    for (const root of roots) {
      for (const f of fs.readdirSync(root).filter((n) => n.endsWith('.ts'))) {
        const src = fs.readFileSync(path.join(root, f), 'utf8');
        expect(src).not.toMatch(/lib\/(rewards|economy|commissions|dealAlerts)/);
      }
    }
  });

  it('architecture doc exists', () => {
    const p = path.resolve(
      __dirname,
      '../../docs/SYSTEMS/ARCHITECTURE_cazaofertasss_phase3_2_tracking.md'
    );
    expect(fs.existsSync(p)).toBe(true);
  });
});
