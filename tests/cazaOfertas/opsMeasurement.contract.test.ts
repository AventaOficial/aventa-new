/**
 * CazaOfertasss — FASE 3.3. Ops / measurement contracts.
 */

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  assertCazaOfertasMoneyUntouched,
  assertNoRevenueRankingWhenUnknown,
  buildBusinessEvent,
  buildDailySnapshot,
  buildFunnelSnapshot,
  buildOpsDashboard,
  businessEventIdempotencyKey,
  createInMemoryBusinessEventStore,
  createInMemoryPublicationPerformance,
  emptyOpsDashboard,
  loadDailyBusinessEvents,
  safeRate,
  toTelegramPublicationObservables,
  TELEGRAM_METRIC_CAPABILITIES,
  CAZAOFERTAS_AVENTA_BOUNDARY,
  type PublicationPerformanceRecord,
} from '@/lib/cazaOfertas';

const NOW = '2026-09-19T20:00:00.000Z';
const DAY = '2026-09-19';

describe('FASE 3.3 — business events', () => {
  it('deterministic event IDs + replay duplicate', async () => {
    const store = createInMemoryBusinessEventStore();
    const built = buildBusinessEvent({
      eventType: 'DEAL_DISCOVERED',
      occurredAt: NOW,
      source: 'discovery',
      identityKey: 'amazon_mx:pid:B08N5WRWNW',
      recordedAt: NOW,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.eventId).toBe(
      businessEventIdempotencyKey({
        eventType: 'DEAL_DISCOVERED',
        identityKey: 'amazon_mx:pid:B08N5WRWNW',
        occurredAt: NOW,
      })
    );
    const a = await store.append(built.value);
    const b = await store.append(built.value);
    expect(a.appended).toBe(true);
    expect(b.duplicate).toBe(true);
    expect(store.size()).toBe(1);
  });

  it('100 concurrent writes same id → one append', async () => {
    const store = createInMemoryBusinessEventStore();
    const built = buildBusinessEvent({
      eventType: 'CLICK',
      occurredAt: NOW,
      source: 'tracking',
      identityKey: 'pub|click|1',
      publicationId: 'pub-1',
      recordedAt: NOW,
    });
    if (!built.ok) throw new Error('build');
    const results = await Promise.all(
      Array.from({ length: 100 }, () => store.append(built.value))
    );
    expect(results.filter((r) => r.appended)).toHaveLength(1);
    expect(results.filter((r) => r.duplicate)).toHaveLength(99);
  });

  it('rejects money metadata keys + mutate forbidden', async () => {
    expect(
      buildBusinessEvent({
        eventType: 'COMMISSION',
        occurredAt: NOW,
        source: 'ops_derived',
        identityKey: 'ops_commission_signal',
        recordedAt: NOW,
        metadata: { revenue_amount: '10' },
      }).ok
    ).toBe(false);
    const store = createInMemoryBusinessEventStore();
    await expect(store.tryMutate()).rejects.toThrow(/append_only/);
  });

  it('TELEGRAM_VIEW requires evidence source', () => {
    expect(
      buildBusinessEvent({
        eventType: 'TELEGRAM_VIEW',
        occurredAt: NOW,
        source: 'ops_derived',
        identityKey: 'pub-1',
        recordedAt: NOW,
      }).ok
    ).toBe(false);
  });
});

describe('FASE 3.3 — UNKNOWN ≠ 0 + zero denominator', () => {
  it('safeRate null when denominator 0 or null', () => {
    expect(safeRate(1, 0)).toBeNull();
    expect(safeRate(1, null)).toBeNull();
    expect(safeRate(null, 10)).toBeNull();
    expect(safeRate(5, 10)).toBe(0.5);
  });

  it('daily snapshot keeps null when event type absent', () => {
    const snap = buildDailySnapshot({
      date: DAY,
      events: [],
      activePublications: null,
      computedAt: NOW,
    });
    expect(snap.dealsDiscovered).toBeNull();
    expect(snap.clicks).toBeNull();
    expect(snap.commission).toBeNull();
    expect(snap.currency).toBeNull();
  });

  it('funnel rates null across unknown stages', () => {
    const funnel = buildFunnelSnapshot({
      window: { fromInclusive: `${DAY}T00:00:00.000Z`, toExclusive: `${DAY}T23:59:59.999Z` },
      counts: {
        discovered: 10,
        validated: 5,
        publishable: null,
        prepared: null,
        published: 2,
        clicked: null,
        attributed: null,
        converted: null,
        approved: null,
        commission: null,
      },
      computedAt: NOW,
    });
    const validatedRate = funnel.rates.find((r) => r.from === 'discovered' && r.to === 'validated');
    expect(validatedRate?.rate).toBe(0.5);
    const pubRate = funnel.rates.find((r) => r.from === 'publishable' && r.to === 'prepared');
    expect(pubRate?.rate).toBeNull();
  });
});

describe('FASE 3.3 — attribution UNKNOWN + publication performance', () => {
  it('records attribution unknown without inventing known revenue ranking', async () => {
    const store = createInMemoryBusinessEventStore();
    const ev = buildBusinessEvent({
      eventType: 'ATTRIBUTION_UNKNOWN',
      occurredAt: NOW,
      source: 'attribution',
      identityKey: 'track|unk',
      recordedAt: NOW,
    });
    if (!ev.ok) throw new Error('build');
    await store.append(ev.value);

    const rows: PublicationPerformanceRecord[] = [
      {
        publicationId: 'p1',
        candidateIdentityKey: 'amazon_mx:pid:X',
        store: 'amazon_mx',
        category: 'electronics',
        affiliateNetwork: 'amazon_associates_mx',
        trackingLabel: 'caza_label_01',
        publishedAt: NOW,
        revision: 1,
        clicks: 12,
        orders: null,
        approvedOrders: null,
        commission: null,
        currency: null,
        revenueUnknown: true,
      },
    ];
    expect(() => assertNoRevenueRankingWhenUnknown(rows)).not.toThrow();
    const perf = createInMemoryPublicationPerformance(rows);
    const activeUnk = await perf.listActiveWithRevenueUnknown({ limit: 10 });
    expect(activeUnk).toHaveLength(1);
    const byClicks = await perf.listByClicks({ limit: 10 });
    expect(byClicks[0]?.clicks).toBe(12);
  });
});

describe('FASE 3.3 — telegram metrics + dashboard', () => {
  it('views/forwards/reactions always null from observables', () => {
    const o = toTelegramPublicationObservables({
      publicationId: 'p1',
      telegramMessageId: '9',
      telegramChatId: '-1001',
      publishedAt: NOW,
      status: 'PUBLISHED',
      attemptCount: 1,
      lastErrorCode: null,
    });
    expect(o.views).toBeNull();
    expect(o.forwards).toBeNull();
    expect(o.reactions).toBeNull();
    expect(TELEGRAM_METRIC_CAPABILITIES.some((c) => c.name === 'channel_views' && c.kind === 'unknown')).toBe(
      true
    );
  });

  it('empty dashboard has null revenue unknown amount', () => {
    const d = emptyOpsDashboard(NOW);
    expect(d.revenue.unknown).toBeNull();
    expect(d.today.knownRevenue).toBeNull();
    const built = buildOpsDashboard({ ...d, asOf: NOW });
    expect(built.schemaVersion).toBe('caza.ops.dashboard.v1');
  });
});

describe('FASE 3.3 — windowed load + isolation', () => {
  it('loadDailyBusinessEvents is bounded', async () => {
    const store = createInMemoryBusinessEventStore();
    for (let i = 0; i < 5; i += 1) {
      const e = buildBusinessEvent({
        eventType: 'DEAL_VALIDATED',
        occurredAt: `${DAY}T0${i}:00:00.000Z`,
        source: 'validation',
        identityKey: `deal-${i}`,
        recordedAt: NOW,
        metadata: { dedupe_salt: String(i) },
      });
      if (!e.ok) throw new Error('build');
      await store.append(e.value);
    }
    const dayEvents = await loadDailyBusinessEvents(store, DAY, 100);
    expect(dayEvents.length).toBe(5);
  });

  it('provider revenue isolation + Aventa money untouched', () => {
    expect(() => assertCazaOfertasMoneyUntouched()).not.toThrow();
    expect(CAZAOFERTAS_AVENTA_BOUNDARY.writesAventaCommissions).toBe(false);
    const root = path.resolve(__dirname, '../../lib/cazaOfertas/ops');
    for (const f of fs.readdirSync(root).filter((n) => n.endsWith('.ts'))) {
      const src = fs.readFileSync(path.join(root, f), 'utf8');
      expect(src).not.toMatch(/lib\/(rewards|economy|commissions|dealAlerts)/);
      expect(src).not.toMatch(/creator_rewards|payout_intents|reward_payouts/);
    }
  });

  it('architecture + operating loop docs exist', () => {
    expect(
      fs.existsSync(
        path.resolve(__dirname, '../../docs/SYSTEMS/ARCHITECTURE_cazaofertasss_phase3_3_ops_measurement.md')
      )
    ).toBe(true);
    expect(
      fs.existsSync(path.resolve(__dirname, '../../docs/SYSTEMS/OPERATING_LOOP_cazaofertasss.md'))
    ).toBe(true);
  });
});
