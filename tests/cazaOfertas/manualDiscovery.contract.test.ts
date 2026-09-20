/**
 * CazaOfertasss — FASE 4.1. Manual/Operator discovery source.
 *
 * Matriz: A valid · B malformed URL · C stale evidence · D negative price
 *         E duplicate identity · F conflicting identity · L replay import
 *         M 200 limit · N >200 rejected · P Telegram eligibility · Q money isolation
 */

import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  CAZAOFERTAS_FORBIDDEN_IMPORT_PATTERNS,
  MANUAL_IMPORT_MAX_ITEMS,
  buildAffiliateMapping,
  buildTrackingLabel,
  createAffiliateMappingResolver,
  createCazaPipelineRunner,
  createInMemoryAffiliateMappingRepository,
  createInMemoryDealCandidateRepository,
  createInMemoryDealPublicationRepository,
  createManualDealDiscoverySource,
  createManualDealDiscoverySources,
  networkForStore,
  parseManualDealImportCsv,
  parseManualDealImportJson,
  prepareManualDealImport,
  type AffiliateAttachmentResolver,
  type CazaPipelineRunnerDeps,
  type CazaTelegramBotPort,
  type ManualDealImportEnvelope,
  type TelegramCanaryGate,
} from '@/lib/cazaOfertas';

import { NOW, NOW_ISO } from './fixtures';

const CAPTURED = '2026-09-19T11:30:00.000Z';
const CHANNEL = '@cazaofertasss';
const GATE: TelegramCanaryGate = {
  mode: 'canary',
  allowedChannels: [CHANNEL],
  credentialEnvVar: 'CAZAOFERTAS_TELEGRAM_BOT_TOKEN',
};

function asin(i: number): string {
  return `B0M${String(i).padStart(7, '0')}`;
}

function item(i: number, overrides: Record<string, unknown> = {}) {
  return {
    source: 'ops_sheet',
    store: 'amazon_mx',
    externalProductId: asin(i),
    canonicalUrl: `https://www.amazon.com.mx/dp/${asin(i)}?th=1&utm_source=ops`,
    title: `Producto manual ${i}`,
    currentPrice: 1999,
    referencePrice: 3499,
    currency: 'MXN',
    capturedAt: CAPTURED,
    evidence: {
      source: 'store_official_api',
      evidenceQuality: 'strong',
      priceConfidence: 'verified',
      historicalConfidence: 'observed_history',
      observationWindowDays: 30,
      observationCount: 20,
      couponApplied: false,
      promotionApplied: true,
    },
    category: 'electronics',
    availability: 'in_stock',
    seller: { trustClass: 'official_store', displayName: 'Amazon México' },
    ...overrides,
  };
}

function envelope(items: unknown[], overrides: Partial<ManualDealImportEnvelope> = {}): ManualDealImportEnvelope {
  return {
    importId: 'imp_test_001',
    source: 'ops_sheet',
    format: 'json',
    receivedAt: NOW_ISO,
    limit: MANUAL_IMPORT_MAX_ITEMS,
    items,
    ...overrides,
  };
}

function firstError(report: { errors: readonly { reasonCode: string }[] }): string {
  return report.errors[0]?.reasonCode ?? '';
}

// ---------------------------------------------------------------------------
// Contract + validators
// ---------------------------------------------------------------------------

describe('FASE 4.1 manual discovery — contract + validators', () => {
  it('A: ítem válido → accepted=1, draft con identidad store+pid, reporte completo', async () => {
    const prepared = await prepareManualDealImport(envelope([item(1)]), { now: NOW });
    expect(prepared.report).toMatchObject({
      importId: 'imp_test_001',
      source: 'ops_sheet',
      format: 'json',
      received: 1,
      accepted: 1,
      rejected: 0,
      duplicates: 0,
      conflicts: 0,
      errors: [],
    });
    expect(prepared.drafts).toHaveLength(1);
    expect(prepared.drafts[0].identityKey).toBe(`amazon_mx:pid:${asin(1)}`);
    expect(prepared.drafts[0].draft.url).toContain(asin(1));
    expect(prepared.drafts[0].draft.evidence.capturedAt).toBe(CAPTURED);
    expect(prepared.drafts[0].draft.evidence.currentPrice).toBe(1999);
  });

  it('B: URLs malformadas y esquemas javascript:/data:/file:/http: se rechazan', async () => {
    const items = [
      item(1, { canonicalUrl: 'javascript:alert(1)' }),
      item(2, { canonicalUrl: 'data:text/html,<script>' }),
      item(3, { canonicalUrl: 'file:///etc/passwd' }),
      item(4, { canonicalUrl: 'http://www.amazon.com.mx/dp/B0M0000004' }),
      item(5, { canonicalUrl: 'no es una url' }),
      item(6, { canonicalUrl: 'https://evil.example.com/dp/B0M0000006' }),
    ];
    const prepared = await prepareManualDealImport(envelope(items), { now: NOW });
    expect(prepared.report.accepted).toBe(0);
    expect(prepared.report.rejected).toBe(6);
    const codes = prepared.report.errors.map((e) => e.reasonCode);
    expect(codes[0]).toBe('manual_import.url_scheme_forbidden:javascript');
    expect(codes[1]).toBe('manual_import.url_scheme_forbidden:data');
    expect(codes[2]).toBe('manual_import.url_scheme_forbidden:file');
    expect(codes[3]).toBe('manual_import.url_scheme_forbidden:http');
    expect(codes[4]).toMatch(/url|invalid/);
    expect(codes[5]).toMatch(/host_not_allowed|store_host_mismatch/);
    expect(prepared.report.errors.map((e) => e.index)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('C: evidencia obsoleta (o futura) se rechaza en el import', async () => {
    const stale = item(1, { capturedAt: '2026-09-19T04:00:00.000Z' });
    const future = item(2, { capturedAt: '2026-09-19T13:00:00.000Z' });
    const prepared = await prepareManualDealImport(envelope([stale, future]), { now: NOW });
    expect(prepared.report.accepted).toBe(0);
    expect(prepared.report.errors.map((e) => e.reasonCode)).toEqual(['evidence.stale', 'evidence.stale']);
  });

  it('D: precio negativo, moneda no soportada, tienda desconocida, descuento imposible', async () => {
    const items = [
      item(1, { currentPrice: -10 }),
      item(2, { currency: 'USD' }),
      item(3, { store: 'walmart_mx' }),
      item(4, { currentPrice: 3499, referencePrice: 1999 }),
      item(5, { currentPrice: '0' }),
    ];
    const prepared = await prepareManualDealImport(envelope(items), { now: NOW });
    expect(prepared.report.accepted).toBe(0);
    const codes = prepared.report.errors.map((e) => e.reasonCode);
    expect(codes[0]).toBe('price.negative');
    expect(codes[1]).toMatch(/currency/);
    expect(codes[2]).toMatch(/store/);
    expect(codes[3]).toBe('manual_import.reference_not_above_current');
    expect(codes[4]).toBe('price.zero');
  });

  it('evidencia ausente o incoherente se rechaza (no se inventa evidencia)', async () => {
    const noEvidence = { ...item(1) } as Record<string, unknown>;
    delete noEvidence.evidence;
    const incoherent = item(2, {
      evidence: {
        source: 'page_claim',
        evidenceQuality: 'strong',
        priceConfidence: 'verified',
        historicalConfidence: 'page_claimed',
        observationWindowDays: null,
        observationCount: null,
        couponApplied: false,
        promotionApplied: false,
      },
    });
    const prepared = await prepareManualDealImport(envelope([noEvidence, incoherent]), { now: NOW });
    expect(prepared.report.accepted).toBe(0);
    expect(firstError(prepared.report)).toBe('manual_import.item_invalid');
    expect(prepared.report.errors[1].reasonCode).toMatch(/evidence/);
  });

  it('E: mismo ítem repetido → duplicates, un solo draft', async () => {
    const prepared = await prepareManualDealImport(envelope([item(1), item(1), item(1)]), { now: NOW });
    expect(prepared.report).toMatchObject({ received: 3, accepted: 1, duplicates: 2, conflicts: 0, rejected: 0 });
    expect(prepared.drafts).toHaveLength(1);
  });

  it('F: misma identidad con canonical URL distinta → conflict (no se sobreescribe identidad)', async () => {
    const other = item(1, {
      canonicalUrl: `https://www.amazon.com.mx/Producto-Manual/dp/${asin(1)}`,
      title: 'Mismo pid, otra URL',
    });
    const prepared = await prepareManualDealImport(envelope([item(1), other]), { now: NOW });
    expect(prepared.report).toMatchObject({ accepted: 1, conflicts: 1, duplicates: 0 });
    expect(prepared.report.errors[0]).toMatchObject({
      index: 1,
      reasonCode: 'manual_import.identity_conflict',
    });
    expect(prepared.drafts.map((d) => d.index)).toEqual([0]);
  });

  it('F: conflicto contra candidato ya persistido con otra canonical URL', async () => {
    const repo = createInMemoryDealCandidateRepository();
    const first = await prepareManualDealImport(envelope([item(1)]), { now: NOW });
    const { runner } = pipeline({ sources: createManualDealDiscoverySources(first), candidateRepo: repo });
    await runner.runCycle({ mode: 'discovery' });

    const conflicting = item(1, { canonicalUrl: `https://www.amazon.com.mx/Otro-Slug/dp/${asin(1)}` });
    const second = await prepareManualDealImport(envelope([conflicting]), {
      now: NOW,
      existingCandidates: repo,
    });
    expect(second.report.conflicts).toBe(1);
    expect(second.report.accepted).toBe(0);
    expect(firstError(second.report)).toBe('manual_import.identity_conflict_existing');
  });

  it('M: 200 ítems → accepted=200; N: 201 → rechazo completo sin procesar parcialmente', async () => {
    const two_hundred = Array.from({ length: 200 }, (_, i) => item(i + 1));
    const ok = await prepareManualDealImport(envelope(two_hundred), { now: NOW });
    expect(ok.report.accepted).toBe(200);
    expect(ok.drafts).toHaveLength(200);

    const over = await prepareManualDealImport(envelope([...two_hundred, item(201)]), { now: NOW });
    expect(over.report.accepted).toBe(0);
    expect(over.report.rejected).toBe(201);
    expect(over.drafts).toHaveLength(0);
    expect(over.report.errors).toEqual([
      { index: -1, reasonCode: 'manual_import.limit_exceeded:201>200', reasons: [] },
    ]);

    const envelopeLimitTooHigh = await prepareManualDealImport(envelope([item(1)], { limit: 201 }), {
      now: NOW,
    });
    expect(firstError(envelopeLimitTooHigh.report)).toBe('manual_import.envelope_invalid');

    const smallerLimit = await prepareManualDealImport(envelope([item(1), item(2), item(3)], { limit: 2 }), {
      now: NOW,
    });
    expect(smallerLimit.report.accepted).toBe(0);
    expect(firstError(smallerLimit.report)).toBe('manual_import.limit_exceeded:3>2');
  });

  it('limit es obligatorio en el envelope', async () => {
    const raw = { ...envelope([item(1)]) } as Record<string, unknown>;
    delete raw.limit;
    const prepared = await prepareManualDealImport(raw, { now: NOW });
    expect(prepared.report.accepted).toBe(0);
    expect(firstError(prepared.report)).toBe('manual_import.envelope_invalid');
  });

  it('el reporte nunca contiene títulos, URLs ni secretos de los ítems', async () => {
    const token = '123456789:AAHfakeTokenValue_abcdefghijklmnop';
    const prepared = await prepareManualDealImport(
      envelope([item(1, { title: `Producto ${token}`, currentPrice: -1 }), item(2, { source: token })]),
      { now: NOW }
    );
    const raw = JSON.stringify(prepared.report);
    expect(raw).not.toContain(token);
    expect(raw).not.toContain('amazon.com.mx');
    expect(raw).not.toMatch(/\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/);
  });
});

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

describe('FASE 4.1 manual discovery — parsers JSON / CSV', () => {
  it('JSON: array o {items}, tamaño y cantidad acotados, sin prototype pollution', () => {
    expect(parseManualDealImportJson(JSON.stringify([item(1)])).ok).toBe(true);
    expect(parseManualDealImportJson(JSON.stringify({ items: [item(1)] })).ok).toBe(true);
    expect(parseManualDealImportJson('{"foo":1}')).toEqual({ ok: false, reasons: ['manual_import.json_shape_invalid'] });
    expect(parseManualDealImportJson('nope')).toEqual({ ok: false, reasons: ['manual_import.json_invalid'] });
    const many = JSON.stringify(Array.from({ length: 201 }, (_, i) => item(i)));
    const over = parseManualDealImportJson(many);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.reasons[0]).toBe('manual_import.limit_exceeded:201>200');
    const big = parseManualDealImportJson('[]', { maxBytes: 1 });
    expect(big.ok).toBe(false);
    const polluted = parseManualDealImportJson('[{"__proto__":{"x":1},"store":"amazon_mx"}]');
    expect(polluted.ok).toBe(true);
    if (polluted.ok) {
      expect(Object.keys(polluted.value[0] as object)).toEqual(['store']);
    }
  });

  it('CSV: header obligatorio, columnas conocidas, coerción de enteros/booleanos, comillas', async () => {
    const csv = [
      'store,external_product_id,canonical_url,title,current_price,reference_price,currency,captured_at,evidence_source,evidence_quality,price_confidence,historical_confidence,observation_window_days,observation_count,coupon_applied,promotion_applied,seller_trust_class',
      `amazon_mx,${asin(7)},https://www.amazon.com.mx/dp/${asin(7)},"Producto, con coma y ""comillas""","1,999.00",3499,MXN,${CAPTURED},store_official_api,strong,verified,observed_history,30,20,false,true,official_store`,
    ].join('\r\n');
    const parsed = parseManualDealImportCsv(csv);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toHaveLength(1);
    const first = parsed.value[0] as Record<string, unknown>;
    expect(first.title).toBe('Producto, con coma y "comillas"');
    expect((first.evidence as Record<string, unknown>).observationWindowDays).toBe(30);
    expect((first.evidence as Record<string, unknown>).promotionApplied).toBe(true);

    const prepared = await prepareManualDealImport(envelope(parsed.value as unknown[], { format: 'csv' }), {
      now: NOW,
    });
    expect(prepared.report.accepted).toBe(1);
    expect(prepared.drafts[0].draft.currentPrice).toBe(1999);

    expect(parseManualDealImportCsv('').ok).toBe(false);
    const unknownCol = parseManualDealImportCsv('store,canonical_url,title,current_price,currency,captured_at,evil\n');
    expect(unknownCol.ok).toBe(false);
    if (!unknownCol.ok) expect(unknownCol.reasons[0]).toMatch(/csv_unknown_columns:evil/);
    const missing = parseManualDealImportCsv('store,title\namazon_mx,x');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reasons[0]).toMatch(/csv_missing_columns/);
    expect(parseManualDealImportCsv('store,canonical_url,title,current_price,currency,captured_at\n"abierta').ok).toBe(false);
  });

  it('CSV: más de 200 filas se rechaza completo', () => {
    const header = 'store,canonical_url,title,current_price,currency,captured_at';
    const rows = Array.from({ length: 201 }, (_, i) => `amazon_mx,https://www.amazon.com.mx/dp/${asin(i)},t,1,MXN,${CAPTURED}`);
    const r = parseManualDealImportCsv([header, ...rows].join('\n'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons[0]).toMatch(/limit_exceeded/);
  });
});

// ---------------------------------------------------------------------------
// Pipeline integration (runner intacto)
// ---------------------------------------------------------------------------

function countingBot(): CazaTelegramBotPort & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() {
      return state.calls;
    },
    async sendMessage(input) {
      state.calls += 1;
      return { ok: true, messageId: String(9000 + state.calls), chatId: input.chatId };
    },
  };
}

function pipeline(options: {
  sources: CazaPipelineRunnerDeps['sources'];
  resolver?: AffiliateAttachmentResolver;
  candidateRepo?: ReturnType<typeof createInMemoryDealCandidateRepository>;
  pubRepo?: ReturnType<typeof createInMemoryDealPublicationRepository>;
  bot?: CazaTelegramBotPort & { calls: number };
}) {
  const candidateRepo = options.candidateRepo ?? createInMemoryDealCandidateRepository();
  const pubRepo = options.pubRepo ?? createInMemoryDealPublicationRepository();
  const bot = options.bot ?? countingBot();
  const runner = createCazaPipelineRunner({
    sources: options.sources,
    candidateRepository: candidateRepo,
    publicationRepository: pubRepo,
    bot,
    gate: GATE,
    telegramChannel: CHANNEL,
    affiliateResolver: options.resolver,
    clock: () => NOW,
  });
  return { runner, candidateRepo, pubRepo, bot };
}

async function mappingFor(i: number, overrides: Record<string, unknown> = {}) {
  const built = buildAffiliateMapping(
    {
      store: 'amazon_mx',
      externalProductId: asin(i),
      canonicalUrl: `https://www.amazon.com.mx/dp/${asin(i)}`,
      affiliateUrl: `https://www.amazon.com.mx/dp/${asin(i)}?tag=cazaofertasss-20`,
      ...overrides,
    },
    { now: NOW }
  );
  if (!built.ok) throw new Error(`fixture mapping ${built.reasons.join(',')}`);
  return built.value;
}

describe('FASE 4.1 manual discovery — integración con CazaPipelineRunner', () => {
  it('la fuente implementa DealDiscoverySource: respeta limit y pagina por cursor', async () => {
    const prepared = await prepareManualDealImport(envelope([item(1), item(2), item(3)]), { now: NOW });
    const source = createManualDealDiscoverySource(prepared, { clock: () => NOW });
    expect(source.sourceId).toBe('manual:imp_test_001:amazon_mx');
    expect(source.store).toBe('amazon_mx');
    expect(source.itemCount).toBe(3);
    const page1 = await source.discover({ limit: 2 });
    expect(page1.ok).toBe(true);
    if (!page1.ok) return;
    expect(page1.value.items).toHaveLength(2);
    expect(page1.value.nextCursor).toBe('2');
    const page2 = await source.discover({ limit: 2, cursor: page1.value.nextCursor });
    if (!page2.ok) throw new Error('page2');
    expect(page2.value.items).toHaveLength(1);
    expect(page2.value.nextCursor).toBeNull();
  });

  it('import multi-tienda produce una fuente por tienda', async () => {
    const ml = item(9, {
      store: 'mercadolibre_mx',
      externalProductId: 'MLM1234567890',
      canonicalUrl: 'https://www.mercadolibre.com.mx/audifonos/p/MLM1234567890',
    });
    const prepared = await prepareManualDealImport(envelope([item(1), ml]), { now: NOW });
    expect(prepared.report.accepted).toBe(2);
    const sources = createManualDealDiscoverySources(prepared);
    expect(sources.map((s) => s.store)).toEqual(['amazon_mx', 'mercadolibre_mx']);
    expect(() => createManualDealDiscoverySource(prepared)).toThrow(/multiple_stores/);
  });

  it('P: sólo publica en Telegram el ítem con mapping FOUND; NOT_FOUND / DISABLED / stale no publican', async () => {
    const mappings = createInMemoryAffiliateMappingRepository();
    await mappings.upsert(await mappingFor(1));
    await mappings.upsert(await mappingFor(3, { status: 'DISABLED' }));
    const resolver = createAffiliateMappingResolver(mappings, { clock: () => NOW });

    const prepared = await prepareManualDealImport(
      envelope([
        item(1), // FOUND → publica
        item(2), // NOT_FOUND → no publica
        item(3), // DISABLED → no publica
        item(4, { capturedAt: '2026-09-19T01:00:00.000Z' }), // stale → ni entra al pipeline
      ]),
      { now: NOW }
    );
    expect(prepared.report.accepted).toBe(3);
    expect(prepared.report.rejected).toBe(1);

    const { runner, candidateRepo, pubRepo, bot } = pipeline({
      sources: createManualDealDiscoverySources(prepared, { clock: () => NOW }),
      resolver,
    });
    const result = await runner.runCycle({ mode: 'full' });

    expect(result.discovered).toBe(3);
    expect(result.validated).toBe(3);
    expect(result.affiliateEligible).toBe(1);
    expect(result.prepared).toBe(1);
    expect(result.published).toBe(1);
    expect(bot.calls).toBe(1);
    expect(candidateRepo.size()).toBe(3);

    const published = await candidateRepo.findByIdentityKey(`amazon_mx:pid:${asin(1)}`);
    expect(published?.status).toBe('PUBLICATION_READY');
    expect(published?.affiliateUrl).toBe(`https://www.amazon.com.mx/dp/${asin(1)}?tag=cazaofertasss-20`);
    const notFound = await candidateRepo.findByIdentityKey(`amazon_mx:pid:${asin(2)}`);
    expect(notFound?.affiliate).toBeNull();
    expect(notFound?.status).not.toBe('PUBLICATION_READY');
    const disabled = await candidateRepo.findByIdentityKey(`amazon_mx:pid:${asin(3)}`);
    expect(disabled?.affiliate).toBeNull();

    const due = await pubRepo.listDueForSend(10, NOW);
    expect(due).toHaveLength(0);
    const forPublished = await pubRepo.listByDealId(published!.id, 5);
    expect(forPublished).toHaveLength(1);
    expect(forPublished[0].status).toBe('PUBLISHED');
    expect(await pubRepo.listByDealId(notFound!.id, 5)).toHaveLength(0);
    expect(JSON.stringify(result)).not.toMatch(/creator_rewards|payout|commission/i);
  });

  it('L: replay del mismo import no crea candidatos ni publicaciones duplicadas', async () => {
    const mappings = createInMemoryAffiliateMappingRepository();
    await mappings.upsert(await mappingFor(1));
    await mappings.upsert(await mappingFor(2));
    const resolver = createAffiliateMappingResolver(mappings, { clock: () => NOW });
    const shared = { candidateRepo: createInMemoryDealCandidateRepository(), pubRepo: createInMemoryDealPublicationRepository(), bot: countingBot() };

    const prepared = await prepareManualDealImport(envelope([item(1), item(2)]), { now: NOW });
    const first = pipeline({ sources: createManualDealDiscoverySources(prepared), resolver, ...shared });
    const r1 = await first.runner.runCycle({ mode: 'full' });
    expect(r1.published).toBe(2);
    expect(shared.bot.calls).toBe(2);

    const replayed = await prepareManualDealImport(envelope([item(1), item(2)]), {
      now: NOW,
      existingCandidates: shared.candidateRepo,
    });
    expect(replayed.report).toMatchObject({ accepted: 2, conflicts: 0 });
    const second = pipeline({ sources: createManualDealDiscoverySources(replayed), resolver, ...shared });
    const r2 = await second.runner.runCycle({ mode: 'full' });
    expect(r2.deduplicated).toBe(2);
    expect(r2.prepared).toBe(0);
    expect(r2.published).toBe(0);
    expect(shared.bot.calls).toBe(2);
    expect(shared.candidateRepo.size()).toBe(2);
    const c = await shared.candidateRepo.findByIdentityKey(`amazon_mx:pid:${asin(1)}`);
    expect(c?.revision).toBe(1);
  });

  it('el resolver de mappings es intercambiable con cualquier AffiliateAttachmentResolver (runner intacto)', async () => {
    const prepared = await prepareManualDealImport(envelope([item(1)]), { now: NOW });
    const custom: AffiliateAttachmentResolver = {
      async resolve(input) {
        const label = buildTrackingLabel(input.dealId, networkForStore(input.identity.store), input.now);
        if (!label.ok) return label;
        return {
          ok: true,
          value: {
            affiliateNetwork: 'amazon_associates_mx',
            affiliateUrl: `${input.canonicalUrl}?tag=cazaofertasss-20`,
            affiliateTrackingLabel: label.value,
            affiliateGeneratedAt: input.now,
            affiliateCredentialRef: 'CAZAOFERTAS_AMAZON_ASSOCIATE_TAG',
          },
        };
      },
    };
    const { runner } = pipeline({ sources: createManualDealDiscoverySources(prepared), resolver: custom });
    const r = await runner.runCycle({ mode: 'full' });
    expect(r.published).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Q — money isolation
// ---------------------------------------------------------------------------

describe('FASE 4.1 manual discovery — Q money isolation', () => {
  const DIR = path.resolve(__dirname, '../../lib/cazaOfertas/manualDiscovery');
  const FILES = fs.readdirSync(DIR).map((f) => path.join(DIR, f));

  it('no importa money path ni módulos externos (salvo zod)', () => {
    const violations: string[] = [];
    for (const file of FILES) {
      const src = fs.readFileSync(file, 'utf8');
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const target = m[1];
        if (CAZAOFERTAS_FORBIDDEN_IMPORT_PATTERNS.some((p) => target.includes(p))) {
          violations.push(`${path.basename(file)} → ${target}`);
        }
        if (!target.startsWith('.') && target !== 'zod') {
          violations.push(`${path.basename(file)} → external ${target}`);
        }
      }
      expect(src, file).not.toMatch(/creator_rewards|payout_intents|reward_payouts|\bcommissions\b|settlement/i);
      expect(src, file).not.toMatch(/fetchAll|listAll/);
    }
    expect(violations).toEqual([]);
  });
});
