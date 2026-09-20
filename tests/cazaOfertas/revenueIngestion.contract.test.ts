/**
 * CazaOfertasss — FASE 3. Contratos de revenue ingestion & reconciliation.
 */

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  assertAttributionNotInvented,
  assertCazaOfertasMoneyUntouched,
  buildRawRevenueRecord,
  computeDerivedRevenueMetrics,
  createInMemoryAffiliateRevenueLedger,
  createInMemoryAffiliateRevenueSource,
  createInMemoryPublicationAttributionIndex,
  createInMemoryRevenueAttributionStore,
  createUnsupportedAmazonAssociatesSource,
  createUnsupportedMercadoLibreAffiliatesSource,
  ingestRevenueBatch,
  ingestRevenueRecord,
  reconcileExternalSale,
  reconciliationCoreEqual,
  CAZA_FORBIDDEN_AVENTA_MONEY_TABLES,
  CAZAOFERTAS_AVENTA_BOUNDARY,
} from '@/lib/cazaOfertas';

const NOW = '2026-09-19T15:00:00.000Z';
const TRACK = 'caza_0f1e2d3c_20260919';
const PUB = 'caza_amazon_mx_abcd1234|amazon_associates_mx|@cazaofertasss|caza_0f1e2d3c_20260919';
const DEAL = 'caza_amazon_mx_abcd1234';

function harness() {
  const ledger = createInMemoryAffiliateRevenueLedger();
  const attributions = createInMemoryRevenueAttributionStore();
  const publicationIndex = createInMemoryPublicationAttributionIndex([
    { trackingLabel: TRACK, publicationId: PUB, dealId: DEAL },
  ]);
  return { ledger, attributions, publicationIndex };
}

describe('FASE 3 — sources stubs (no formatos inventados)', () => {
  it('Amazon y ML oficial = unsupported', async () => {
    const amz = createUnsupportedAmazonAssociatesSource();
    const ml = createUnsupportedMercadoLibreAffiliatesSource();
    const a = await amz.fetchBatch({ batchId: 'b1', receivedAt: NOW });
    const m = await ml.fetchBatch({ batchId: 'b1', receivedAt: NOW });
    expect(a.ok).toBe(false);
    expect(m.ok).toBe(false);
    if (!a.ok) expect(a.reasons.join(',')).toContain('official_report_format_unknown');
  });

  it('InMemory source entrega fixtures neutrales', async () => {
    const raw = buildRawRevenueRecord({
      provider: 'amazon_associates_mx',
      externalReference: 'SALE-100',
      eventType: 'ORDER',
      status: 'PENDING',
      grossAmount: 999,
    });
    const src = createInMemoryAffiliateRevenueSource('amazon_associates_mx', [raw]);
    const r = await src.fetchBatch({ batchId: 'batch_fixt', receivedAt: NOW });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.records).toHaveLength(1);
  });
});

describe('FASE 3 — ingestión idempotente', () => {
  it('duplicate import y replay no duplican', async () => {
    const h = harness();
    const raw = buildRawRevenueRecord({
      provider: 'amazon_associates_mx',
      externalReference: 'SALE-DUP',
      eventType: 'COMMISSION',
      status: 'APPROVED',
      commissionAmount: 50,
      trackingIdentifier: TRACK,
    });
    const a = await ingestRevenueRecord({ ...h, raw, recordedAt: NOW });
    const b = await ingestRevenueRecord({ ...h, raw, recordedAt: NOW });
    expect(a.outcome).toBe('appended');
    expect(b.outcome).toBe('duplicate');
    expect(h.ledger.size()).toBe(1);
  });

  it('same sale appearing twice = duplicate', async () => {
    const h = harness();
    const raw = buildRawRevenueRecord({
      provider: 'mercadolibre_affiliates',
      externalReference: 'ML-SALE-1',
      eventType: 'ORDER',
      status: 'PENDING',
      grossAmount: 200,
    });
    const batch = await ingestRevenueBatch({
      ...h,
      records: [raw, raw],
      recordedAt: NOW,
    });
    expect(batch.appended).toBe(1);
    expect(batch.duplicates).toBe(1);
  });

  it('100 concurrent imports → un solo append', async () => {
    const h = harness();
    const raw = buildRawRevenueRecord({
      provider: 'amazon_associates_mx',
      externalReference: 'SALE-CONC-100',
      eventType: 'COMMISSION',
      status: 'APPROVED',
      commissionAmount: 12.34,
      trackingIdentifier: TRACK,
    });
    const results = await Promise.all(
      Array.from({ length: 100 }, () =>
        ingestRevenueRecord({ ...h, raw, recordedAt: NOW })
      )
    );
    const appended = results.filter((r) => r.outcome === 'appended' || r.outcome.startsWith('appended'));
    const duplicates = results.filter((r) => r.outcome === 'duplicate');
    expect(appended.length).toBe(1);
    expect(duplicates.length).toBe(99);
    expect(h.ledger.size()).toBe(1);
  });

  it('concurrent import de claves distintas todas pasan', async () => {
    const h = harness();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        ingestRevenueRecord({
          ...h,
          raw: buildRawRevenueRecord({
            provider: 'amazon_associates_mx',
            externalReference: `SALE-PAR-${i}`,
            eventType: 'ORDER',
            status: 'PENDING',
            grossAmount: 100 + i,
          }),
          recordedAt: NOW,
        })
      )
    );
    expect(results.every((r) => r.outcome !== 'rejected')).toBe(true);
    expect(h.ledger.size()).toBe(20);
  });
});

describe('FASE 3 — lifecycle pending → approved (nuevos eventos)', () => {
  it('ORDER pending + APPROVED_ORDER + COMMISSION = reconciliación aprobada', async () => {
    const h = harness();
    const ref = 'SALE-LIFE-1';
    await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'amazon_associates_mx',
        externalReference: ref,
        eventType: 'ORDER',
        status: 'PENDING',
        grossAmount: 1500,
        trackingIdentifier: TRACK,
      }),
      recordedAt: NOW,
    });
    await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'amazon_associates_mx',
        externalReference: ref,
        eventType: 'APPROVED_ORDER',
        status: 'APPROVED',
        grossAmount: 1500,
        trackingIdentifier: TRACK,
      }),
      recordedAt: NOW,
    });
    await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'amazon_associates_mx',
        externalReference: ref,
        eventType: 'COMMISSION',
        status: 'APPROVED',
        commissionAmount: 75,
        grossAmount: 1500,
        trackingIdentifier: TRACK,
      }),
      recordedAt: NOW,
    });

    const snap = await reconcileExternalSale({
      ledger: h.ledger,
      attributions: h.attributions,
      provider: 'amazon_associates_mx',
      externalReference: ref,
      reconciledAt: NOW,
    });
    expect(snap.orderPending).toBe(true);
    expect(snap.orderApproved).toBe(true);
    expect(snap.commissionApprovedAmount?.value).toBe(75);
    expect(snap.attribution).toBe('ATTRIBUTED');
    expect(snap.publicationId).toBe(PUB);
  });

  it('COMMISSION reenviada con otro status = duplicate (first-write-wins)', async () => {
    const h = harness();
    const ref = 'SALE-FWW';
    const pending = await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'amazon_associates_mx',
        externalReference: ref,
        eventType: 'COMMISSION',
        status: 'PENDING',
        commissionAmount: 40,
      }),
      recordedAt: NOW,
    });
    const again = await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'amazon_associates_mx',
        externalReference: ref,
        eventType: 'COMMISSION',
        status: 'APPROVED',
        commissionAmount: 40,
      }),
      recordedAt: NOW,
    });
    expect(pending.outcome.startsWith('appended')).toBe(true);
    expect(again.outcome).toBe('duplicate');
    expect(again.event?.status).toBe('PENDING');
  });
});

describe('FASE 3 — reversal / cancellation', () => {
  it('reversal es evento compensatorio; neto baja', async () => {
    const h = harness();
    const ref = 'SALE-REV-1';
    await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'amazon_associates_mx',
        externalReference: ref,
        eventType: 'COMMISSION',
        status: 'APPROVED',
        commissionAmount: 100,
        trackingIdentifier: TRACK,
      }),
      recordedAt: NOW,
    });
    await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'amazon_associates_mx',
        externalReference: ref,
        eventType: 'REVERSAL',
        status: 'REVERSED',
        commissionAmount: 100,
        reversesExternalReference: ref,
        trackingIdentifier: TRACK,
      }),
      recordedAt: NOW,
    });
    const snap = await reconcileExternalSale({
      ledger: h.ledger,
      attributions: h.attributions,
      provider: 'amazon_associates_mx',
      externalReference: ref,
      reconciledAt: NOW,
    });
    expect(snap.commissionReversedAmount?.value).toBe(100);
    expect(snap.netCommissionAmount?.value).toBe(0);
  });

  it('cancellation marca orden cancelada', async () => {
    const h = harness();
    const ref = 'SALE-CAN-1';
    await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'mercadolibre_affiliates',
        externalReference: ref,
        eventType: 'ORDER',
        status: 'PENDING',
        grossAmount: 300,
      }),
      recordedAt: NOW,
    });
    await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'mercadolibre_affiliates',
        externalReference: ref,
        eventType: 'CANCELLATION',
        status: 'CANCELLED',
        grossAmount: 300,
        reversesExternalReference: ref,
      }),
      recordedAt: NOW,
    });
    const snap = await reconcileExternalSale({
      ledger: h.ledger,
      provider: 'mercadolibre_affiliates',
      externalReference: ref,
      reconciledAt: NOW,
    });
    expect(snap.orderCancelled).toBe(true);
  });
});

describe('FASE 3 — attribution UNKNOWN', () => {
  it('sin tracking ⇒ UNKNOWN; no inventa publication', async () => {
    const h = harness();
    const r = await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'amazon_associates_mx',
        externalReference: 'SALE-UNK-1',
        eventType: 'COMMISSION',
        status: 'APPROVED',
        commissionAmount: 10,
        trackingIdentifier: null,
      }),
      recordedAt: NOW,
    });
    expect(r.outcome).toBe('appended_with_unknown_attribution');
    expect(r.attribution?.decision).toBe('UNKNOWN');
    expect(r.attribution?.publicationId).toBeNull();
    expect(r.event?.dealId).toBeNull();
    expect(assertAttributionNotInvented('UNKNOWN', null).ok).toBe(true);
    expect(assertAttributionNotInvented('ATTRIBUTED', null).ok).toBe(false);
  });

  it('tracking desconocido ⇒ UNMATCHED_TRACKING', async () => {
    const h = harness();
    const r = await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'amazon_associates_mx',
        externalReference: 'SALE-UM-1',
        eventType: 'ORDER',
        status: 'PENDING',
        grossAmount: 50,
        trackingIdentifier: 'caza_no_such_label_99',
      }),
      recordedAt: NOW,
    });
    expect(r.attribution?.decision).toBe('UNMATCHED_TRACKING');
  });
});

describe('FASE 3 — validación fail-closed', () => {
  it('malformed provider record', async () => {
    const h = harness();
    const r = await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'amazon_associates_mx',
        externalReference: 'x', // too short
        eventType: 'ORDER',
        status: 'PENDING',
      }),
      recordedAt: NOW,
    });
    expect(r.outcome).toBe('rejected');
  });

  it('currency mismatch', async () => {
    const h = harness();
    const r = await ingestRevenueRecord({
      ...h,
      raw: {
        ...buildRawRevenueRecord({
          provider: 'amazon_associates_mx',
          externalReference: 'SALE-FX-1',
          eventType: 'COMMISSION',
          status: 'APPROVED',
          commissionAmount: 10,
          currency: 'MXN',
        }),
        // fuerza gross con moneda distinta vía campo ya normalizado — simula raw inconsistente
        grossAmount: 100,
        currency: 'USD' as unknown as string,
      },
      recordedAt: NOW,
    });
    expect(r.outcome).toBe('rejected');
    expect(r.reasons.join(',')).toMatch(/currency/);
  });

  it('negative commission', async () => {
    const h = harness();
    const r = await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'amazon_associates_mx',
        externalReference: 'SALE-NEG-1',
        eventType: 'COMMISSION',
        status: 'APPROVED',
        commissionAmount: -5,
      }),
      recordedAt: NOW,
    });
    expect(r.outcome).toBe('rejected');
  });

  it('zero commission', async () => {
    const h = harness();
    const r = await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'amazon_associates_mx',
        externalReference: 'SALE-ZERO-1',
        eventType: 'COMMISSION',
        status: 'APPROVED',
        commissionAmount: 0,
      }),
      recordedAt: NOW,
    });
    expect(r.outcome).toBe('rejected');
  });
});

describe('FASE 3 — reconciliación determinista + métricas', () => {
  it('misma entrada ⇒ mismo core de reconciliación', async () => {
    const h = harness();
    const ref = 'SALE-DET-1';
    await ingestRevenueBatch({
      ...h,
      recordedAt: NOW,
      records: [
        buildRawRevenueRecord({
          provider: 'amazon_associates_mx',
          externalReference: ref,
          eventType: 'ORDER',
          status: 'PENDING',
          grossAmount: 200,
          trackingIdentifier: TRACK,
        }),
        buildRawRevenueRecord({
          provider: 'amazon_associates_mx',
          externalReference: ref,
          eventType: 'COMMISSION',
          status: 'APPROVED',
          commissionAmount: 20,
          trackingIdentifier: TRACK,
        }),
      ],
    });
    const a = await reconcileExternalSale({
      ledger: h.ledger,
      attributions: h.attributions,
      provider: 'amazon_associates_mx',
      externalReference: ref,
      reconciledAt: NOW,
    });
    const b = await reconcileExternalSale({
      ledger: h.ledger,
      attributions: h.attributions,
      provider: 'amazon_associates_mx',
      externalReference: ref,
      reconciledAt: '2099-01-01T00:00:00.000Z',
    });
    expect(reconciliationCoreEqual(a, b)).toBe(true);

    const metrics = computeDerivedRevenueMetrics({
      events: h.ledger.all(),
      attributions: [
        ...(await h.attributions.listByPublicationId(PUB, 100)),
        // include unknowns via find — store doesn't list all; rebuild from events
      ],
      provider: 'amazon_associates_mx',
      computedAt: NOW,
    });
    // Rebuild attributions from known events
    const attrs = [];
    for (const e of h.ledger.all()) {
      const a = await h.attributions.findByEventId(e.eventId);
      if (a) attrs.push(a);
    }
    const m2 = computeDerivedRevenueMetrics({
      events: h.ledger.all(),
      attributions: attrs,
      provider: 'amazon_associates_mx',
      computedAt: NOW,
    });
    expect(m2.ordersPending).toBe(1);
    expect(m2.commissionApproved?.value).toBe(20);
    expect(m2.attributedCount).toBeGreaterThanOrEqual(1);
    void metrics;
  });
});

describe('FASE 3 — ledger immutability', () => {
  it('tryMutate falla; attributions tryUpdate falla', async () => {
    const h = harness();
    await ingestRevenueRecord({
      ...h,
      raw: buildRawRevenueRecord({
        provider: 'amazon_associates_mx',
        externalReference: 'SALE-IMM-1',
        eventType: 'CLICK',
        status: 'APPROVED',
        commissionAmount: null,
        currency: null,
      }),
      recordedAt: NOW,
    });
    await expect(h.ledger.tryMutate('x')).rejects.toThrow(/append_only/);
    await expect(h.attributions.tryUpdate({} as never)).rejects.toThrow(/append_only/);
  });
});

describe('FASE 3 — RLS / production isolation (contrato)', () => {
  it('DDL declara RLS fail-closed y tablas caza_*', () => {
    const ddlPath = path.resolve(
      __dirname,
      '../../docs/supabase-migrations/20260919_cazaofertas_revenue_ingestion.sql'
    );
    const ddl = fs.readFileSync(ddlPath, 'utf8');
    expect(ddl).toContain('ENABLE ROW LEVEL SECURITY');
    expect(ddl).toContain('REVOKE ALL ON TABLE public.caza_revenue_attributions');
    expect(ddl).toContain('caza_revenue_import_batches');
    expect(ddl).toContain('caza_revenue_raw_records');
    expect(ddl).toContain('caza_revenue_attributions');
    for (const t of CAZA_FORBIDDEN_AVENTA_MONEY_TABLES) {
      expect(ddl).not.toMatch(new RegExp(`CREATE TABLE.*${t}`, 'i'));
      expect(ddl).not.toMatch(new RegExp(`ALTER TABLE public\\.${t}`, 'i'));
    }
  });

  it('Aventa money path untouched + production isolation flags', () => {
    expect(() => assertCazaOfertasMoneyUntouched()).not.toThrow();
    expect(CAZAOFERTAS_AVENTA_BOUNDARY.writesAventaRewards).toBe(false);
    expect(CAZAOFERTAS_AVENTA_BOUNDARY.writesAventaPayoutIntents).toBe(false);
    expect(CAZAOFERTAS_AVENTA_BOUNDARY.writesAventaCommissions).toBe(false);
    expect(CAZAOFERTAS_AVENTA_BOUNDARY.sharesEconomicTables).toBe(false);
  });

  it('ningún archivo revenue importa money path Aventa', () => {
    const root = path.resolve(__dirname, '../../lib/cazaOfertas/revenue');
    const files = fs.readdirSync(root).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      expect(src).not.toMatch(/lib\/(rewards|economy|commissions|dealAlerts)/);
    }
  });
});
