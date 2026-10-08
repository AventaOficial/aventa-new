import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { executeImport } from '@/lib/affiliate/conversionBridge/executeImport';
import { importProviderEvents, type ExistingConversion } from '@/lib/affiliate/conversionBridge/importEngine';
import { createMemoryEconomicPort } from '@/lib/affiliate/conversionBridge/memoryPort';
import type { ClickSnapshot } from '@/lib/affiliate/conversionBridge/match';
import {
  classifyProviderCoverage,
  snapshotFromEvents,
  type CountableConversion,
} from '@/lib/affiliate/conversionBridge/growthRead';
import { parseMercadoLibreOfficialReport } from '@/lib/affiliate/conversionBridge/providers/mercadolibreOfficialReport';
import {
  parseTestProviderReport,
  TEST_PROVIDER_HEADERS,
} from '@/lib/affiliate/conversionBridge/providers/testProviderReport';
import { runOwnerImport } from '@/lib/affiliate/conversionBridge/runOwnerImport';
import { normalizeProviderStatus } from '@/lib/affiliate/conversionBridge/status';
import { buildGrowthWarRoomView } from '@/lib/growth/warRoom';

const NOW = Date.parse('2026-11-15T18:00:00.000Z');
const IMPORTED_AT = new Date(NOW).toISOString();

const humanClick: ClickSnapshot = {
  clickId: 'click-1',
  offerId: 'offer-1',
  references: ['click-1'],
  utmSource: 'tiktok',
  utmMedium: 'paid',
  utmCampaign: 'bf26',
  utmContent: 'video_017',
  utmTerm: null,
  campaignKey: 'bf26',
  actorType: 'HUMAN',
  hunterUserId: 'hunter-1',
};

function csv(rows: string[]): string {
  return [TEST_PROVIDER_HEADERS.join(','), ...rows].join('\n');
}

function line(input: {
  id?: string;
  order?: string;
  click?: string;
  offer?: string;
  status?: string;
  commission?: string;
  currency?: string;
  at?: string;
}): string {
  return [
    input.id ?? 'cv-1',
    input.order ?? 'ord-1',
    input.click ?? 'click-1',
    input.offer ?? 'offer-1',
    input.status ?? 'ventas aprobadas',
    input.commission ?? '12.50',
    input.currency ?? 'MXN',
    input.at ?? '2026-11-02T15:00:00.000Z',
    'TEST_PROVIDER_DATA_V1',
  ].join(',');
}

function runBatch(report: string, clicks: ClickSnapshot[] = [humanClick], existing: ExistingConversion[] = []) {
  const parsed = parseTestProviderReport(report, IMPORTED_AT);
  if (!parsed.ok) return { parsed, batch: null };
  const batch = importProviderEvents({
    batchId: 'batch-1',
    importedAt: IMPORTED_AT,
    nowMs: NOW,
    schemaVersion: parsed.schemaVersion,
    testData: true,
    events: parsed.events,
    clicks,
    existing,
  });
  return { parsed, batch };
}

describe('affiliate conversion bridge', () => {
  it('acepta una fila válida y conserva la evidencia', () => {
    const { batch } = runBatch(csv([line({})]));
    expect(batch?.status).toBe('succeeded');
    const row = batch?.rows[0];
    expect(row?.disposition).toBe('accepted');
    if (row?.disposition !== 'accepted') return;
    expect(row.event.canonicalStatus).toBe('CONFIRMED');
    expect(row.event.testData).toBe(true);
    expect(row.evidence.provider).toBe('MERCADOLIBRE');
    expect(row.evidence.source_mode).toBe('OFFICIAL_REPORT_IMPORT');
    expect(row.evidence.external_conversion_id).toBe('cv-1');
    expect(row.evidence.external_order_id).toBe('ord-1');
    expect(row.decision.payout).toBe(false);
    expect(row.decision.hunterRewardEligible).toBe(true);
    expect(row.match.campaign).toMatchObject({
      status: 'ATTRIBUTED',
      utmSource: 'tiktok',
      utmMedium: 'paid',
      utmCampaign: 'bf26',
      utmContent: 'video_017',
    });
  });

  it('rechaza una fila inválida y la deja en el lote', () => {
    const { batch } = runBatch(csv([line({ status: 'estado inventado' })]));
    expect(batch?.rejected).toBe(1);
    expect(batch?.rows[0]).toMatchObject({
      disposition: 'rejected',
      qualityFlags: ['PROVIDER_STATUS_UNKNOWN'],
    });
  });

  it('no duplica la economía si el mismo archivo entra dos veces', async () => {
    const report = csv([line({})]);
    const first = runBatch(report);
    const memory = createMemoryEconomicPort();
    await executeImport(first.batch!, memory.port, { allowTestProviderData: true });
    const existing: ExistingConversion[] = memory.state.conversions.map((row) => ({
      externalConversionId: row.externalConversionId,
      externalOrderId: row.externalOrderId,
      canonicalStatus: row.canonicalStatus as ExistingConversion['canonicalStatus'],
    }));
    const second = runBatch(report, [humanClick], existing);
    await executeImport(second.batch!, memory.port, { allowTestProviderData: true });
    expect(second.batch?.duplicates).toBe(1);
    expect(second.batch?.accepted).toBe(0);
    expect(memory.state.conversions).toHaveLength(1);
    expect(memory.state.commissions).toHaveLength(1);
    expect(memory.state.ledger).toHaveLength(0);
    expect(memory.state.payouts).toHaveLength(0);
  });

  it('no crea dos conversiones con el mismo id ni la misma orden', () => {
    const duplicatedId = runBatch(csv([line({}), line({ order: 'ord-2' })]));
    expect(duplicatedId.batch?.duplicates).toBe(1);
    expect(duplicatedId.batch?.accepted).toBe(1);
    const duplicatedOrder = runBatch(csv([line({}), line({ id: 'cv-2' })]));
    expect(duplicatedOrder.batch?.rows[1]).toMatchObject({
      disposition: 'rejected',
      qualityFlags: ['DUPLICATE_ORDER'],
    });
  });

  it('un lote parcial conserva lo válido y registra lo rechazado', () => {
    const { batch } = runBatch(csv([line({}), line({ id: 'cv-2', order: 'ord-2', status: '??', commission: '' })]));
    expect(batch?.status).toBe('partial');
    expect(batch?.accepted).toBe(1);
    expect(batch?.rejected).toBe(1);
  });

  it('un import fallido no se reporta como cero ventas', async () => {
    const parsed = parseMercadoLibreOfficialReport('ventas,comision\n1,2', IMPORTED_AT);
    expect(parsed.ok).toBe(false);
    const result = await runOwnerImport({ report: 'ventas,comision\n1,2', now: new Date(NOW) });
    expect(result.body.importStatus).toBe('failed');
    expect(result.body.confirmedSales).toBeNull();
    expect(result.body.economicsWritten).toBe(0);
    expect(result.body.payoutsCreated).toBe(0);
    expect(result.body.coverage).toBe('DATA_INCOMPLETE');
    expect(result.body.code).toBe('OFFICIAL_REPORT_SCHEMA_NOT_PUBLISHED');
  });

  it('reintenta el mismo lote sin segunda comisión', async () => {
    const report = csv([line({})]);
    const memory = createMemoryEconomicPort();
    const first = runBatch(report);
    await executeImport(first.batch!, memory.port, { allowTestProviderData: true });
    const again = runBatch(report, [humanClick], [
      { externalConversionId: 'cv-1', externalOrderId: 'ord-1', canonicalStatus: 'CONFIRMED' },
    ]);
    const executed = await executeImport(again.batch!, memory.port, { allowTestProviderData: true });
    expect(executed.economicsWritten).toBe(0);
    expect(memory.state.commissions).toHaveLength(1);
  });

  it('normaliza los estados del proveedor y no iguala pendiente con confirmado', () => {
    expect(normalizeProviderStatus('en revisión')).toBe('PENDING');
    expect(normalizeProviderStatus('proceso de pago')).toBe('APPROVED');
    expect(normalizeProviderStatus('ventas aprobadas')).toBe('CONFIRMED');
    expect(normalizeProviderStatus('ganancias verificadas')).toBe('CONFIRMED');
    expect(normalizeProviderStatus('devolución')).toBe('REVERSED');
    expect(normalizeProviderStatus('rechazada')).toBe('INVALID');
    expect(normalizeProviderStatus('misterio')).toBe('UNKNOWN');
    expect(normalizeProviderStatus('en revisión')).not.toBe('CONFIRMED');
    expect(normalizeProviderStatus('proceso de pago')).not.toBe('CONFIRMED');
  });

  it('enlaza el clic exacto y deja UNMATCHED cuando no hay uno solo', () => {
    const matched = runBatch(csv([line({})]));
    const row = matched.batch?.rows[0];
    if (row?.disposition !== 'accepted') throw new Error('expected match');
    expect(row.match.status).toBe('MATCHED');
    expect(row.match.actorType).toBe('HUMAN');

    const unmatched = runBatch(csv([line({ click: 'no-existe' })]));
    const lost = unmatched.batch?.rows[0];
    if (lost?.disposition !== 'accepted') throw new Error('expected unmatched sale');
    expect(lost.match.status).toBe('UNMATCHED');
    expect(lost.match.campaign.status).toBe('UNKNOWN');
    expect(lost.decision.hunterRewardEligible).toBe(false);
    expect(lost.decision.countsAsConfirmedSale).toBe(true);
    expect(lost.qualityFlags).toContain('CONVERSION_WITHOUT_CLICK');
  });

  it('no paga a un cazador máquina ni a sistema', () => {
    const machine: ClickSnapshot = { ...humanClick, actorType: 'MACHINE_HUNTER', hunterUserId: 'bot-1' };
    const system: ClickSnapshot = { ...humanClick, clickId: 'click-sys', references: ['click-sys'], actorType: 'SYSTEM', hunterUserId: 'sys-1' };
    const machineRow = runBatch(csv([line({})]), [machine]).batch?.rows[0];
    const systemRow = runBatch(csv([line({ click: 'click-sys' })]), [system]).batch?.rows[0];
    if (machineRow?.disposition !== 'accepted' || systemRow?.disposition !== 'accepted') throw new Error('expected rows');
    expect(machineRow.decision.hunterRewardEligible).toBe(false);
    expect(machineRow.match.actorType).toBe('MACHINE_HUNTER');
    expect(systemRow.decision.hunterRewardEligible).toBe(false);
    expect(systemRow.decision.countsAsAventaSale).toBe(true);
  });

  it('la comisión confirmada es una y la reversión compensa sin borrar ni pagar', async () => {
    const memory = createMemoryEconomicPort({ settlementEnabled: true, moneyPathFrozen: false });
    const created = runBatch(csv([line({})]));
    await executeImport(created.batch!, memory.port, { allowTestProviderData: true });
    expect(memory.state.commissions).toHaveLength(1);
    expect(memory.state.ledger).toHaveLength(1);
    expect(memory.state.payouts).toHaveLength(0);

    const reversed = runBatch(
      csv([line({ status: 'devolución', commission: '12.50' })]),
      [humanClick],
      [{ externalConversionId: 'cv-1', externalOrderId: 'ord-1', canonicalStatus: 'CONFIRMED' }],
    );
    await executeImport(reversed.batch!, memory.port, { allowTestProviderData: true });
    expect(memory.state.conversions).toHaveLength(1);
    expect(memory.state.conversions[0]?.history).toContain('confirmed');
    expect(memory.state.conversions[0]?.canonicalStatus).toBe('REVERSED');
    expect(memory.state.ledger.map((entry) => entry.kind).sort()).toEqual(['compensating', 'original']);
    expect(memory.state.payouts).toHaveLength(0);
  });

  it('sin puente de settlement no escribe ledger ni payout', async () => {
    const memory = createMemoryEconomicPort();
    const created = runBatch(csv([line({})]));
    await executeImport(created.batch!, memory.port, { allowTestProviderData: true });
    expect(memory.state.commissions[0]?.status).toBe('approved');
    expect(memory.state.ledger).toHaveLength(0);
    expect(memory.state.payouts).toHaveLength(0);
  });

  it('el dato de prueba no entra si no se autoriza', async () => {
    const created = runBatch(csv([line({})]));
    const memory = createMemoryEconomicPort();
    const executed = await executeImport(created.batch!, memory.port);
    expect(executed.economicsWritten).toBe(0);
    expect(memory.state.conversions).toHaveLength(0);
  });

  it('el crecimiento muestra confirmadas y no trata pendiente ni reversa como venta', () => {
    const events: CountableConversion[] = [
      event({ id: 'a', status: 'CONFIRMED', cents: 1250, at: '2026-11-02T15:00:00.000Z' }),
      event({ id: 'b', status: 'PENDING', cents: 0, at: '2026-11-03T15:00:00.000Z' }),
      event({ id: 'c', status: 'APPROVED', cents: 0, at: '2026-11-04T15:00:00.000Z' }),
      event({ id: 'd', status: 'REVERSED', cents: 0, at: '2026-11-05T15:00:00.000Z' }),
      event({ id: 'e', status: 'CONFIRMED', cents: 500, at: '2026-10-01T15:00:00.000Z', campaign: null }),
    ];
    const coverage = classifyProviderCoverage({
      schemaAttested: true,
      batches: [{ status: 'succeeded', testData: false, importedAt: IMPORTED_AT, providerDataAt: IMPORTED_AT, provider: 'MERCADOLIBRE' }],
      amazonConnected: false,
    });
    expect(coverage.state).toBe('PARTIAL_DATA');
    const snapshot = snapshotFromEvents({ nowMs: NOW, events, ...coverage });
    expect(snapshot.sinceLaunch?.confirmedSales).toBe(1);
    expect(snapshot.sinceLaunch?.pendingConversions).toBe(2);
    expect(snapshot.sinceLaunch?.reversedConversions).toBe(1);
    expect(snapshot.sinceLaunch?.confirmedCommissionCents).toBe(1250);
    expect(snapshot.campaigns[0]).toMatchObject({ campaignKey: 'bf26', source: 'tiktok', content: 'video_017', confirmedSales: 1 });
    expect(snapshot.offers[0]).toMatchObject({ offerId: 'offer-1', confirmedSales: 2, pendingConversions: 2 });
    expect(snapshot.content[0]).toMatchObject({ contentId: 'video_017', confirmedSales: 1 });

    const room = buildGrowthWarRoomView({
      nowMs: NOW,
      conversionConnected: false,
      today: { visitors: 10, offerViews: 4, outboundClicks: 40 },
      d7: { visitors: 10, offerViews: 4, outboundClicks: 40 },
      d30: { visitors: 10, offerViews: 4, outboundClicks: 40 },
      sinceLaunch: { visitors: 10, offerViews: 4, outboundClicks: 40 },
      completenessPct: 1,
      outboundVolume: 40,
      attributedClicks: 40,
      byChannel: [{ channel: 'tiktok', clicks: 40 }],
      byCampaign: [{ campaignKey: 'bf26', clicks: 40 }],
      byNetwork: [{ network: 'mercadolibre', clicks: 40 }],
      topOffers: [{ offerId: 'offer-1', clicks: 40 }],
      provider: snapshot,
    });
    expect(room.affiliateConfirmation).toBe('PARTIAL_DATA');
    expect(room.sinceLaunch.salesLabel).toBe('PARTIAL_DATA');
    expect(room.sinceLaunch.confirmedSales).toBe(1);
    expect(room.sinceLaunch.pendingConversions).toBe(2);
    expect(room.campaigns[0]?.confirmedSales).toBe(1);
    expect(room.retailers.best).toBe('mercadolibre');
    expect(room.projectedFinish).toBeNull();
    expect(room.requiredDaily).not.toBeNull();
  });

  it('una sola conversión no declara la mejor tienda', () => {
    const snapshot = snapshotFromEvents({
      nowMs: NOW,
      events: [event({ id: 'a', status: 'CONFIRMED', cents: 100, at: '2026-11-02T15:00:00.000Z' })],
      ...classifyProviderCoverage({
        schemaAttested: true,
        batches: [{ status: 'succeeded', testData: false, importedAt: IMPORTED_AT, providerDataAt: null, provider: 'MERCADOLIBRE' }],
        amazonConnected: false,
      }),
    });
    const room = buildGrowthWarRoomView({
      nowMs: NOW,
      conversionConnected: false,
      today: { visitors: 1, offerViews: 1, outboundClicks: 1 },
      d7: { visitors: 1, offerViews: 1, outboundClicks: 1 },
      d30: { visitors: 1, offerViews: 1, outboundClicks: 1 },
      sinceLaunch: { visitors: 1, offerViews: 1, outboundClicks: 1 },
      completenessPct: 1,
      outboundVolume: 1,
      attributedClicks: 1,
      byChannel: [],
      byCampaign: [],
      byNetwork: [{ network: 'mercadolibre', clicks: 1 }],
      topOffers: [{ offerId: 'offer-1', clicks: 1 }],
      provider: snapshot,
    });
    expect(room.retailers.best).toBeNull();
    expect(room.retailers.insufficient).toContain('mercadolibre');
  });

  it('DATA INCOMPLETE y un import fallido no muestran cero', () => {
    const incomplete = classifyProviderCoverage({ schemaAttested: false, batches: [] });
    expect(incomplete.state).toBe('DATA_INCOMPLETE');
    const failed = classifyProviderCoverage({
      schemaAttested: true,
      batches: [{ status: 'failed', testData: false, importedAt: IMPORTED_AT, providerDataAt: null, provider: 'MERCADOLIBRE' }],
    });
    expect(failed.state).toBe('PROVIDER_IMPORT_FAILED');
    const delayed = classifyProviderCoverage({ schemaAttested: true, batches: [] });
    expect(delayed.state).toBe('DATA_DELAYED');
    const snapshot = snapshotFromEvents({
      nowMs: NOW,
      events: [event({ id: 'a', status: 'CONFIRMED', cents: 100, at: '2026-11-02T15:00:00.000Z' })],
      ...failed,
    });
    expect(snapshot.sinceLaunch).toBeNull();
    expect(snapshot.today).toBeNull();
  });

  it('Mercado Libre no publica un esquema y no acepta datos de prueba en el import del owner', async () => {
    expect(parseMercadoLibreOfficialReport('', IMPORTED_AT).ok).toBe(false);
    expect(parseMercadoLibreOfficialReport('comprador,email\nAna,a@b.c', IMPORTED_AT)).toMatchObject({
      ok: false,
      code: 'PII_OR_SELLER_REPORT_REFUSED',
    });
    const testReport = csv([line({})]);
    const rejected = await runOwnerImport({
      report: testReport,
      now: new Date(NOW),
      adapter: {
        provider: 'MERCADOLIBRE',
        sourceMode: 'OFFICIAL_REPORT_IMPORT',
        providerEventVersion: 'TEST_PROVIDER_DATA_V1',
        testData: true,
        parseReport: parseTestProviderReport,
      },
    });
    expect(rejected.body.code).toBe('TEST_PROVIDER_DATA_REJECTED');
    expect(rejected.body.confirmedSales).toBeNull();
  });

  it('detecta moneda, fecha, reversa sin original y confirmación sin evidencia', () => {
    const { batch } = runBatch(csv([
      line({ id: 'bad-currency', order: 'o1', currency: 'XYZ' }),
      line({ id: 'bad-time', order: 'o2', at: '1999-01-01T00:00:00.000Z' }),
      line({ id: 'rev', order: 'o3', status: 'devolución' }),
      line({ id: 'no-money', order: 'o4', commission: '' }),
      line({ id: '', order: 'o5', commission: '1.00' }),
    ]));
    const flags = batch?.rows.flatMap((row) => row.qualityFlags) ?? [];
    expect(flags).toEqual(expect.arrayContaining([
      'UNKNOWN_CURRENCY',
      'IMPOSSIBLE_TIMESTAMP',
      'REVERSED_WITHOUT_ORIGINAL',
      'CONFIRMED_WITHOUT_EVIDENCE',
      'MISSING_EXTERNAL_ID',
      'COMMISSION_WITHOUT_CONVERSION',
    ]));
    expect(batch?.accepted).toBe(0);
  });

  it('no abre payouts ni cambia el firewall en el código del puente', () => {
    const files = [
      'lib/affiliate/conversionBridge/runOwnerImport.ts',
      'lib/affiliate/conversionBridge/executeImport.ts',
      'lib/affiliate/conversionBridge/supabasePort.ts',
      'lib/affiliate/conversionBridge/growthRead.ts',
      'lib/affiliate/conversionBridge/loadCoverage.ts',
      'lib/growth/warRoom.ts',
      'lib/growth/loadWarRoom.ts',
      'app/api/admin/owner/affiliate-conversions/import/route.ts',
      'app/admin/owner/crecimiento/war-room/page.tsx',
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).not.toMatch(/MONEY_PATH_FROZEN\s*=\s*['"]?false/);
      expect(source).not.toMatch(/REWARDS_PROGRAM_ACTIVE\s*=\s*['"]?true/);
      expect(source).not.toMatch(/REWARDS_PAYOUT_ENABLED\s*=\s*['"]?true/);
      expect(source).not.toMatch(/createPayout|payoutIntent/);
    }
    const growth = readFileSync(join(process.cwd(), 'lib/growth/loadWarRoom.ts'), 'utf8');
    expect(growth).not.toMatch(/settleCommission|recordConversion|executeImport/);
    const route = readFileSync(join(process.cwd(), 'app/api/admin/owner/affiliate-conversions/import/route.ts'), 'utf8');
    expect(route).toContain('requireAffiliateImport');
    expect(route).toContain('enforceRateLimit');
  });
});

function event(input: {
  id: string;
  status: CountableConversion['canonicalStatus'];
  cents: number;
  at: string;
  campaign?: string | null;
}): CountableConversion {
  return {
    occurredAt: input.at,
    canonicalStatus: input.status,
    confirmedCommissionCents: input.cents,
    unmatched: false,
    offerId: 'offer-1',
    retailer: 'mercadolibre',
    channel: 'tiktok',
    campaignKey: input.campaign === undefined ? 'bf26' : input.campaign,
    content: input.campaign === null ? null : 'video_017',
    testData: false,
  };
}
