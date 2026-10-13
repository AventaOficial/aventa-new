import { describe, expect, it } from 'vitest';
import { savingEvidence } from '@/lib/despensa/evidence';
import { engineHistory, loadDespensaOffers } from '@/lib/despensa/despensaFeed';
import type { FeedOffer } from '@/lib/offers/feedService';
import {
  aggregateDailyObservations,
  createAmazonCaptureAdapter,
  createMercadoLibreCaptureAdapter,
  evaluatePriceHistory,
  identityKey,
  observationIdempotencyKey,
  parsePriceCaptureConfig,
  PRICE_CAPTURE_CONFIG_KEY,
  PRICE_EVIDENCE_LABELS,
  readOfferObservations,
  readProduct,
  reviewCapturedObservation,
  runPriceCaptureCycle,
  validateCapturedObservation,
  type CapturedObservation,
  type PriceCaptureAdapter,
  type StoredObservationRow,
} from '@/lib/offers/priceObservations';
import type { MercadoLibrePriceResolution } from '@/lib/offers/resolveMercadoLibrePrice';
import type { PaapiItem } from '@/lib/bots/ingest/amazonPaapi';
import { createMemoryDb, memorySupabase, type MemoryDb } from '../helpers/memorySupabase';

const NOW = new Date('2026-10-12T16:00:00.000Z');
const DAY = 86_400_000;
const iso = (daysAgo: number, from: Date = NOW) => new Date(from.getTime() - daysAgo * DAY).toISOString();

const ARROZ = readProduct('Arroz blanco 1 kg');
const ID_ML = identityKey({ sourceId: 'mercadolibre_mx', externalItemId: 'MLM123456789', ...ARROZ });
const ID_AMZ = identityKey({ sourceId: 'amazon_mx', externalItemId: 'B000TEST01', ...ARROZ });

let seq = 0;
function row(daysAgo: number, price: number, o: Partial<StoredObservationRow> = {}, from: Date = NOW): StoredObservationRow {
  seq += 1;
  return {
    id: `r${seq}`,
    offer_id: 'o1',
    price,
    original_price: null,
    source: 'capture',
    recorded_at: iso(daysAgo, from),
    currency: 'MXN',
    validation_status: 'valid',
    validation_reasons: [],
    identity_key: ID_ML,
    presentation_key: ARROZ.presentationKey,
    scope_kind: 'online',
    scope_label: 'MX',
    availability: 'in_stock',
    corrects_snapshot_id: null,
    ...o,
  };
}

/** Cinco observaciones previas a $40 entre 10 y 30 días atrás: historial longitudinal. */
const PRIOR_40 = () => [row(10, 40), row(15, 40), row(20, 40), row(25, 40), row(30, 40)];

function evaluate(rows: StoredObservationRow[], currentPrice = 34, originalPrice: number | null = null, historyComplete = true) {
  return evaluatePriceHistory({ rows, historyComplete, currentPrice, originalPrice, now: NOW });
}

function verified(e: ReturnType<typeof evaluate>, price = 34) {
  return savingEvidence({ price, history: engineHistory(e) }).status === 'verified';
}

describe('motor de precios: identidad y sanidad del arnés', () => {
  it('la lectura de producto distingue variante y presentación', () => {
    expect(ARROZ.presentationKey).toBe('mass:1000:-');
    expect(ARROZ.needId).toBe('alimentos.arroz');
    expect(readProduct('Leche entera 1 L').variantId).not.toBe(readProduct('Leche deslactosada 1 L').variantId);
    expect(ID_ML).not.toBe(ID_AMZ);
  });

  it('con historial longitudinal y bajada ≥5 % sí hay ahorro verificado (control positivo)', () => {
    const e = evaluate([row(0.1, 34), ...PRIOR_40()]);
    expect(e.label).toBe('verified_saving');
    expect(e.reference).toEqual({ kind: 'own_history_median', price: 40, observations: 5, spanDays: 20 });
    expect(e.savingAmount).toBe(6);
    expect(e.savingPct).toBe(15);
    expect(savingEvidence({ price: 34, history: engineHistory(e) })).toEqual({
      status: 'verified',
      amount: 6,
      percent: 15,
      reference: 40,
      basis: 'own_history_median',
      observations: 5,
    });
  });
});

describe('20 escenarios obligatorios', () => {
  it('1. una sola observación nunca es ahorro verificado', () => {
    const e = evaluate([row(0.1, 34)], 34, 50);
    expect(e.reasons).toEqual(['single_observation']);
    expect(e.label).toBe('list_unconfirmed');
    expect(e.verdict).toBe('insufficient');
    expect(verified(e)).toBe(false);
    expect(evaluate([row(0.1, 34)]).label).toBe('observed_price');
  });

  it('2. dos observaciones válidas y comparables no alcanzan; el historial longitudinal sí', () => {
    const two = evaluate([row(0.1, 34), row(20, 40)]);
    expect(two.reasons).toEqual(['insufficient_history']);
    expect(two.samples).toBe(2);
    expect(verified(two)).toBe(false);
    const full = evaluate([row(0.1, 34), ...PRIOR_40()]);
    expect(verified(full)).toBe(true);
  });

  it('3. historial con respuesta incompleta: no se afirma nada', async () => {
    const e = evaluate([row(0.1, 34), ...PRIOR_40()], 34, 50, false);
    expect(e.reasons).toEqual(['history_incomplete']);
    expect(e.label).toBe('list_unconfirmed');
    expect(verified(e)).toBe(false);

    const db = createMemoryDb({ tables: { offer_price_snapshots: [row(0.1, 34), ...PRIOR_40()] } });
    db.failOn.offer_price_snapshots = { op: 'select', error: { code: '57014', message: 'statement timeout' } };
    const read = await readOfferObservations(memorySupabase(db), ['o1'], { now: NOW });
    expect(read.byOffer.get('o1')).toEqual({ rows: [], complete: false });
    expect(read.failedChunks).toBe(1);
  });

  it('4. historial recortado por el límite de la consulta: queda incompleto', async () => {
    const many = Array.from({ length: 130 }, (_, i) => row(0.1 + i * 0.5, i === 0 ? 34 : 40));
    const db = createMemoryDb({ tables: { offer_price_snapshots: many } });
    const read = await readOfferObservations(memorySupabase(db), ['o1'], { now: NOW });
    expect(read.truncatedChunks).toBe(1);
    const h = read.byOffer.get('o1')!;
    expect(h.complete).toBe(false);
    expect(h.rows).toEqual([]);
    expect(verified(evaluate(h.rows, 34, null, h.complete))).toBe(false);
  });

  it('5. precio anterior invalidado o corregido: no sirve de referencia y la fila se conserva', async () => {
    const superseded = [row(10, 80, { validation_status: 'superseded' }), row(15, 80, { validation_status: 'superseded' })];
    const e = evaluate([row(0.1, 34), row(20, 40), row(25, 40), ...superseded]);
    expect(e.excluded.not_valid).toBe(2);
    expect(verified(e)).toBe(false);

    // Corrección de moderación (source=update) corta el historial anterior.
    const cut = evaluate([row(0.1, 34), row(5, 34, { source: 'update', identity_key: null }), ...PRIOR_40()]);
    expect(cut.excluded.before_correction).toBe(5);
    expect(verified(cut)).toBe(false);

    const bad = row(3, 80);
    const fix = row(1, 40);
    const db = createMemoryDb({ tables: { offer_price_snapshots: [bad, fix] } });
    const res = await reviewCapturedObservation(memorySupabase(db), {
      snapshotId: bad.id,
      status: 'superseded',
      reason: 'precio mal leído',
      correctedBy: fix.id,
      now: NOW,
    });
    expect(res).toEqual({ ok: true, snapshotId: bad.id, status: 'superseded' });
    const stored = db.tables.offer_price_snapshots;
    expect(stored).toHaveLength(2);
    expect(stored.find((r) => r.id === bad.id)).toMatchObject({ price: 80, validation_status: 'superseded' });
    expect((stored.find((r) => r.id === bad.id)!.validation_reasons as string[]).at(-1)).toBe('review:superseded:precio mal leído');
    expect(stored.find((r) => r.id === fix.id)).toMatchObject({ corrects_snapshot_id: bad.id });
    expect(db.writes!.some((w) => w.op === 'delete')).toBe(false);
  });

  it('6. cambio de sucursal: otra sucursal no es historial', () => {
    const centro = { scope_kind: 'store' as const, scope_label: 'Sucursal Centro' };
    const norte = { scope_kind: 'store' as const, scope_label: 'Sucursal Norte' };
    const e = evaluate([row(0.1, 34, norte), ...PRIOR_40().map((r) => ({ ...r, ...centro }))]);
    expect(e.excluded.different_scope).toBe(5);
    expect(e.reasons).toEqual(['single_observation']);
    expect(verified(e)).toBe(false);
  });

  it('7. cambio de zona: otra zona no es historial', () => {
    const cdmx = { scope_kind: 'zone' as const, scope_label: 'CDMX' };
    const mty = { scope_kind: 'zone' as const, scope_label: 'Monterrey' };
    const e = evaluate([row(0.1, 34, mty), ...PRIOR_40().map((r) => ({ ...r, ...cdmx }))]);
    expect(e.excluded.different_scope).toBe(5);
    expect(verified(e)).toBe(false);
    // Ubicación desconocida tampoco se compara.
    const unknown = evaluate([row(0.1, 34, { scope_kind: 'unknown', scope_label: null }), ...PRIOR_40()]);
    expect(unknown.reasons).toEqual(['current_not_comparable']);
  });

  it('8. cambio de presentación: inválida al capturar y fuera de la serie al evaluar', () => {
    const v = validateCapturedObservation(captured({ observed: readProduct('Arroz blanco 500 g') }), [], NOW);
    expect(v).toEqual({ status: 'invalid', reasons: ['presentation_mismatch'] });

    const id500 = identityKey({ sourceId: 'mercadolibre_mx', externalItemId: 'MLM123456789', ...readProduct('Arroz blanco 500 g') });
    const e = evaluate([row(0.1, 34), ...PRIOR_40().map((r) => ({ ...r, identity_key: id500, presentation_key: 'mass:500:-' }))]);
    expect(e.excluded.different_identity).toBe(5);
    expect(verified(e)).toBe(false);
  });

  it('9. cambio de variante: inválida al capturar y fuera de la serie al evaluar', () => {
    const entera = readProduct('Leche entera 1 L');
    const deslactosada = readProduct('Leche deslactosada 1 L');
    const v = validateCapturedObservation(captured({ offer: entera, observed: deslactosada }), [], NOW);
    expect(v).toEqual({ status: 'invalid', reasons: ['variant_mismatch'] });

    const idEntera = identityKey({ sourceId: 'mercadolibre_mx', externalItemId: 'MLM1', ...entera });
    const idDeslac = identityKey({ sourceId: 'mercadolibre_mx', externalItemId: 'MLM1', ...deslactosada });
    const leche = { presentation_key: entera.presentationKey };
    const e = evaluate([row(0.1, 34, { ...leche, identity_key: idEntera }), ...PRIOR_40().map((r) => ({ ...r, ...leche, identity_key: idDeslac }))]);
    expect(e.excluded.different_identity).toBe(5);
    expect(verified(e)).toBe(false);
  });

  it('10. producto agotado: no cuenta como precio disponible', () => {
    const v = validateCapturedObservation(captured({ availability: 'out_of_stock' }), [], NOW);
    expect(v).toEqual({ status: 'valid', reasons: ['out_of_stock'] });
    const e = evaluate([row(0.1, 34, { availability: 'out_of_stock' }), ...PRIOR_40()]);
    expect(e.reasons).toEqual(['current_out_of_stock']);
    expect(verified(e)).toBe(false);
    // Un agotado en el historial tampoco aporta precio.
    const mid = evaluate([row(0.1, 34), row(5, 20, { availability: 'out_of_stock' }), ...PRIOR_40()]);
    expect(mid.excluded.out_of_stock).toBe(1);
    expect(mid.reference?.price).toBe(40);
  });

  it('11. precio extremo: cuarentena, fuera de los cálculos; solo la persistencia lo confirma', () => {
    const prior = PRIOR_40().map((r) => ({ price: Number(r.price), recordedAt: r.recorded_at, status: 'valid' as const, reasons: [] }));
    const v = validateCapturedObservation(captured({ price: 9 }), prior, NOW);
    expect(v).toEqual({ status: 'quarantined', reasons: ['extreme_change_needs_review'] });

    const e = evaluate([row(0.1, 9, { validation_status: 'quarantined', validation_reasons: ['extreme_change_needs_review'] }), ...PRIOR_40()], 9);
    expect(e.excluded.not_valid).toBe(1);
    expect(e.reasons).toEqual(['current_stale']);
    expect(verified(e, 9)).toBe(false);

    const q = (d: number) => ({ price: 9, recordedAt: iso(d), status: 'quarantined' as const, reasons: ['extreme_change_needs_review'] });
    expect(validateCapturedObservation(captured({ price: 9 }), [q(1), ...prior], NOW).status).toBe('quarantined');
    expect(validateCapturedObservation(captured({ price: 9 }), [q(1), q(2), ...prior], NOW)).toEqual({
      status: 'valid',
      reasons: ['confirmed_by_persistence'],
    });
  });

  it('12. precio legítimamente reducido: válido y verificado', () => {
    const prior = PRIOR_40().map((r) => ({ price: Number(r.price), recordedAt: r.recorded_at, status: 'valid' as const, reasons: [] }));
    expect(validateCapturedObservation(captured({ price: 34 }), prior, NOW)).toEqual({ status: 'valid', reasons: [] });
    const e = evaluate([row(0.1, 34), ...PRIOR_40()]);
    expect(e.label).toBe('verified_saving');
    // Una bajada menor al 5 % no es ahorro verificado.
    expect(evaluate([row(0.1, 38.5), ...PRIOR_40()], 38.5).label).toBe('observed_price');
  });

  it('13. dos reintentos idénticos no duplican (llave de idempotencia en la base)', async () => {
    const env = captureEnv();
    const first = await runPriceCaptureCycle(env.deps());
    expect(first.inserted.valid).toBe(2);
    // Mismo día, dos horas después; la pre-comprobación de recientes se reduce a 1 h para que
    // el reintento llegue hasta el INSERT y choque con el índice único.
    env.advance(2 * 3_600_000);
    const second = await runPriceCaptureCycle(env.deps({ minHoursBetweenCaptures: 1 }));
    expect(second.skipped.duplicate_idempotent).toBe(2);
    expect(second.inserted.valid).toBe(0);
    expect(captureRows(env.db)).toHaveLength(2);

    // Con la pre-comprobación normal ni siquiera llama a la fuente.
    const third = await runPriceCaptureCycle(env.deps());
    expect(third.skipped.captured_recently).toBe(2);
    expect(env.mlCalls()).toBe(2);
  });

  it('14. dos corridas simultáneas: el lock deja una; si el lock falla abierto, el índice evita duplicados', async () => {
    const env = captureEnv();
    const [a, b] = await Promise.all([runPriceCaptureCycle(env.deps()), runPriceCaptureCycle(env.deps())]);
    expect([a.status, b.status].sort()).toEqual(['completed', 'skipped_concurrent']);
    expect(captureRows(env.db)).toHaveLength(2);

    const open = captureEnv();
    open.db.failOn.ingest_cycle_locks = { op: 'insert', error: { code: '08006', message: 'connection failure' } };
    const [c, d] = await Promise.all([runPriceCaptureCycle(open.deps()), runPriceCaptureCycle(open.deps())]);
    expect([c.status, d.status]).toEqual(['completed', 'completed']);
    expect(captureRows(open.db)).toHaveLength(2);
    const blocked = (r: typeof c) => (r.skipped.duplicate_idempotent ?? 0) + (r.skipped.captured_recently ?? 0);
    expect(blocked(c) + blocked(d)).toBe(2);
    expect(c.inserted.valid + d.inserted.valid).toBe(2);
  });

  it('15. una tienda falla: se registra el motivo y las demás siguen', async () => {
    const env = captureEnv({ extraMlOffers: 4, mlFails: true });
    const r = await runPriceCaptureCycle(env.deps());
    expect(r.status).toBe('completed');
    expect(r.skipped.source_error).toBe(3);
    expect(r.skipped.source_circuit_open).toBe(2);
    expect(r.perSource.amazon_mx).toEqual({ selected: 1, inserted: 1, failed: 0 });
    expect(captureRows(env.db).map((x) => x.source_id)).toEqual(['amazon_mx']);
    expect(r.events.filter((e) => e.sourceId === 'mercadolibre_mx').every((e) => e.outcome === 'skipped')).toBe(true);
  });

  it('16. presupuesto de tiempo agotado: se detiene y lo registra por candidato', async () => {
    const env = captureEnv({ extraMlOffers: 2, mlCostMs: 25_000 });
    const r = await runPriceCaptureCycle(env.deps({ budgetMs: 40_000 }));
    expect(r.budgetExhausted).toBe(true);
    expect(r.inserted.valid).toBe(2);
    expect(r.skipped.time_budget_exhausted).toBe(2);
    expect(r.events.filter((e) => e.reason === 'time_budget_exhausted').map((e) => e.sourceId).sort()).toEqual([
      'amazon_mx',
      'mercadolibre_mx',
    ]);
  });

  it('17. observaciones de tiendas distintas no se combinan', () => {
    const e = evaluate([row(0.1, 34), ...PRIOR_40().map((r) => ({ ...r, identity_key: ID_AMZ }))]);
    expect(e.excluded.different_identity).toBe(5);
    expect(e.reasons).toEqual(['single_observation']);
    expect(verified(e)).toBe(false);
  });

  it('18. sin historial: información insuficiente o precio de lista sin confirmar', () => {
    const e = evaluate([], 34, null);
    expect(e).toMatchObject({ label: 'insufficient', reasons: ['no_history'], samples: 0, reference: null });
    expect(evaluate([], 34, 60).label).toBe('list_unconfirmed');
    expect(PRICE_EVIDENCE_LABELS[e.label]).toBe('Información insuficiente');
    // Filas legado (sin alcance ni identidad) no cuentan.
    const legacy = evaluate([row(1, 40, { source: 'create', identity_key: null }), row(2, 40, { source: 'app', identity_key: null })]);
    expect(legacy.excluded.legacy_unscoped).toBe(2);
    expect(legacy.reasons).toEqual(['no_history']);
  });

  it('19. historial fuera de la ventana de 90 días no cuenta', () => {
    const old = [100, 105, 110, 115, 120].map((d) => row(d, 40));
    const e = evaluate([row(0.1, 34), ...old]);
    expect(e.excluded.outside_window).toBe(5);
    expect(e.reasons).toEqual(['single_observation']);
    expect(verified(e)).toBe(false);
    // Observación actual vieja (> 48 h): no se trata como precio vigente.
    expect(evaluate([row(3, 34), ...PRIOR_40()]).reasons).toEqual(['current_stale']);
  });

  it('20. las agregaciones conservan los estados de validación', () => {
    const d = (h: number) => ({ recorded_at: new Date(Date.parse('2026-10-11T00:00:00.000Z') + h * 3_600_000).toISOString() });
    const rows = [
      row(0, 40, d(1)),
      row(0, 42, d(2)),
      row(0, 9, { ...d(3), validation_status: 'quarantined' }),
      row(0, 41, { ...d(4), validation_status: 'invalid', currency: 'USD' }),
      row(0, 80, { ...d(5), validation_status: 'superseded' }),
      row(0, 39, { ...d(6), availability: 'out_of_stock' }),
      row(0, 40, { ...d(7), source: 'create', identity_key: null, validation_status: null }),
    ];
    const agg = aggregateDailyObservations(rows);
    const series = agg.find((a) => a.seriesKey.startsWith(ID_ML))!;
    expect(series.day).toBe('2026-10-11');
    expect(series.statusCounts).toEqual({ valid: 3, quarantined: 1, invalid: 1, superseded: 1, legacy: 0 });
    expect(series.outOfStock).toBe(1);
    expect(series.valid).toEqual({ count: 2, min: 40, max: 42, median: 41 });
    const legacy = agg.find((a) => a.seriesKey === 'legacy:o1')!;
    expect(legacy.statusCounts.legacy).toBe(1);
    expect(legacy.valid).toBeNull();
  });
});

describe('captura periódica: controles', () => {
  it('apagada sin fila de configuración: no consulta ofertas ni escribe', async () => {
    const env = captureEnv({ config: null });
    const r = await runPriceCaptureCycle(env.deps());
    expect(r).toMatchObject({ status: 'disabled', detail: 'no_config_row', selected: 0 });
    expect(env.db.writes).toEqual([]);
    expect(env.mlCalls()).toBe(0);
  });

  it('pausada por app_config sin borrar la configuración', async () => {
    const env = captureEnv({ config: { enabled: true, paused: true } });
    expect((await runPriceCaptureCycle(env.deps())).detail).toBe('paused');
    expect(parsePriceCaptureConfig({ enabled: 'true' }).enabled).toBe(false);
    expect(parsePriceCaptureConfig({ enabled: true, maxCandidates: 10_000, budgetMs: 10_000_000 })).toMatchObject({
      enabled: true,
      maxCandidates: 60,
      budgetMs: 120_000,
    });
  });

  it('sin la migración aplicada no escribe nada', async () => {
    const env = captureEnv();
    env.db.missingColumns = { offer_price_snapshots: ['validation_status', 'idempotency_key'] };
    const r = await runPriceCaptureCycle(env.deps());
    expect(r.status).toBe('schema_missing');
    expect(env.db.writes).toEqual([]);
  });

  it('nunca publica ni modifica ofertas; solo escribe observaciones y el lock', async () => {
    const env = captureEnv();
    const before = JSON.stringify(env.db.tables.offers);
    await runPriceCaptureCycle(env.deps());
    expect(JSON.stringify(env.db.tables.offers)).toBe(before);
    expect(new Set(env.db.writes!.map((w) => w.table))).toEqual(new Set(['offer_price_snapshots', 'ingest_cycle_locks']));
    expect(env.db.writes!.some((w) => w.op === 'delete')).toBe(false);
  });

  it('fuentes sin API autorizada se omiten con motivo; Amazon respeta sus propios flags', async () => {
    const env = captureEnv({ amazonEnabled: false });
    const r = await runPriceCaptureCycle(env.deps());
    expect(r.skipped.source_not_supported).toBe(1);
    expect(r.skipped.source_disabled).toBe(1);
    expect(r.events).toContainEqual({ offerId: 'sor1', sourceId: 'soriana_mx', outcome: 'skipped', reason: 'source_not_supported' });
    expect(captureRows(env.db).map((x) => x.source_id)).toEqual(['mercadolibre_mx']);
  });

  it('respeta los topes por fuente y por corrida', async () => {
    // Orden de candidatos (más nuevas primero): ml1, amz1, sor1, tech1, mlx0…mlx4.
    const bySource = await runPriceCaptureCycle(
      captureEnv({ extraMlOffers: 5 }).deps({ maxPerSource: { mercadolibre_mx: 2, amazon_mx: 10 }, maxCandidates: 10 }),
    );
    expect(bySource.selected).toBe(3);
    expect(bySource.perSource.mercadolibre_mx?.selected).toBe(2);
    expect(bySource.skipped.over_source_cap).toBe(4);

    const byRun = await runPriceCaptureCycle(captureEnv({ extraMlOffers: 5 }).deps({ maxCandidates: 1 }));
    expect(byRun.selected).toBe(1);
    expect(byRun.skipped.over_run_cap).toBe(6);
  });

  it('la fila guardada declara procedencia, validación e idempotencia sin datos sensibles', async () => {
    const env = captureEnv();
    await runPriceCaptureCycle(env.deps());
    const ml = captureRows(env.db).find((x) => x.source_id === 'mercadolibre_mx')!;
    expect(ml).toMatchObject({
      offer_id: 'ml1',
      price: 34,
      source: 'capture',
      currency: 'MXN',
      external_item_id: 'MLM123456789',
      identity_key: ID_ML,
      scope_kind: 'online',
      scope_label: 'MX',
      availability: 'in_stock',
      capture_method: 'ml_official_api',
      validation_status: 'valid',
      policy_version: 'price-observation-v1',
      idempotency_key: observationIdempotencyKey({
        offerId: 'ml1',
        sourceId: 'mercadolibre_mx',
        externalItemId: 'MLM123456789',
        scope: { kind: 'online', label: 'MX' },
        observedAtMs: NOW.getTime(),
      }),
    });
    expect(JSON.stringify(ml)).not.toMatch(/token|secret|cookie|authorization/i);
  });

  it('una moneda distinta de MXN se guarda como inválida y no cuenta', async () => {
    const env = captureEnv({ mlCurrency: 'USD' });
    const r = await runPriceCaptureCycle(env.deps());
    expect(r.inserted.invalid).toBe(1);
    expect(captureRows(env.db).find((x) => x.source_id === 'mercadolibre_mx')).toMatchObject({
      validation_status: 'invalid',
      validation_reasons: ['currency_not_mxn'],
    });
  });

  it('modo de prueba (dryRun): lee y valida sin escribir nada, ni el lock', async () => {
    const env = captureEnv();
    const r = await runPriceCaptureCycle({ ...env.deps(), dryRun: true });
    expect(r).toMatchObject({ status: 'completed', dryRun: true, inserted: { valid: 2, quarantined: 0, invalid: 0, superseded: 0 } });
    expect(env.db.writes).toEqual([]);
    expect(captureRows(env.db)).toHaveLength(0);
  });

  it('el registro estructurado no incluye credenciales', async () => {
    const lines: string[] = [];
    const env = captureEnv();
    await runPriceCaptureCycle({ ...env.deps(), log: (l) => lines.push(l) });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[price-capture\] /);
    expect(lines[0]).not.toMatch(/AKIA|secret|partner|token/i);
  });
});

describe('Despensa usa el motor', () => {
  it('historial capturado y comparable produce ahorro verificado con referencia de mediana', async () => {
    const now = new Date();
    const rows = [row(0.05, 34, {}, now), ...[10, 15, 20, 25, 30].map((d) => row(d, 40, {}, now))];
    const db = createMemoryDb({ tables: { offers: [{ id: 'o1', source_currency: 'MXN' }], offer_price_snapshots: rows } });
    const out = await loadDespensaOffers(memorySupabase(db), [feedOffer({ id: 'o1', title: 'Arroz blanco 1 kg', price: 34 })]);
    expect(out.offers[0].priceHistory?.engine).toMatchObject({ label: 'verified_saving', savingAmount: 6, savingPct: 15 });
    expect(savingEvidence({ price: 34, history: out.offers[0].priceHistory })).toMatchObject({ status: 'verified', basis: 'own_history_median' });
  });

  it('sin la migración, lee el formato legado y no verifica ahorro', async () => {
    const db = createMemoryDb({
      tables: {
        offers: [{ id: 'o1', source_currency: 'MXN' }],
        offer_price_snapshots: [{ id: 'l1', offer_id: 'o1', price: 40, source: 'create', recorded_at: new Date().toISOString() }],
      },
    });
    db.missingColumns = { offer_price_snapshots: ['validation_status'] };
    const out = await loadDespensaOffers(memorySupabase(db), [feedOffer({ id: 'o1', title: 'Arroz blanco 1 kg', price: 34 })]);
    expect(out.offers[0].priceHistory?.engine?.label).toBe('insufficient');
  });
});

// ── Arnés ───────────────────────────────────────────────────────────────

function captured(o: Partial<CapturedObservation> = {}): CapturedObservation {
  return {
    price: 34,
    currency: 'MXN',
    observedAt: NOW.toISOString(),
    availability: 'in_stock',
    scopeKind: 'online',
    observed: ARROZ,
    offer: ARROZ,
    ...o,
  };
}

function captureRows(db: MemoryDb) {
  return (db.tables.offer_price_snapshots ?? []).filter((r) => r.source === 'capture');
}

function offerRow(id: string, title: string, url: string, price: number, fingerprint: string | null = null) {
  return {
    id,
    title,
    price,
    original_price: null,
    offer_url: url,
    product_fingerprint: fingerprint,
    source_currency: 'MXN',
    status: 'approved',
    deleted_at: null,
    expires_at: null,
    created_at: '2026-10-10T00:00:00.000Z',
  };
}

type EnvOpts = {
  config?: Record<string, unknown> | null;
  amazonEnabled?: boolean;
  extraMlOffers?: number;
  mlFails?: boolean;
  mlCostMs?: number;
  mlCurrency?: string;
};

function captureEnv(opts: EnvOpts = {}) {
  let t = NOW.getTime();
  let mlCalls = 0;
  const offers = [
    offerRow('ml1', 'Arroz blanco 1 kg', 'https://articulo.mercadolibre.com.mx/MLM-123456789-arroz', 34, 'ml:MLM123456789'),
    offerRow('amz1', 'Frijol negro 900 g', 'https://www.amazon.com.mx/dp/B000TEST01', 28),
    offerRow('sor1', 'Aceite vegetal 1 L', 'https://www.soriana.com/p/1', 45),
    offerRow('tech1', 'Audífonos bluetooth', 'https://www.amazon.com.mx/dp/B000TEST02', 300),
    ...Array.from({ length: opts.extraMlOffers ?? 0 }, (_, i) =>
      offerRow(`mlx${i}`, 'Arroz blanco 1 kg', `https://articulo.mercadolibre.com.mx/MLM-55500${i}-arroz`, 34, `ml:MLM55500${i}`),
    ),
  ].map((o, i) => ({ ...o, created_at: new Date(Date.parse('2026-10-10T00:00:00.000Z') - i * 60_000).toISOString() }));
  const db = createMemoryDb({
    tables: {
      app_config: opts.config === null ? [] : [{ key: PRICE_CAPTURE_CONFIG_KEY, value: opts.config ?? { enabled: true } }],
      offers,
      offer_price_snapshots: [],
      ingest_cycle_locks: [],
    },
    unique: {
      offer_price_snapshots: [{ columns: ['idempotency_key'], where: (r) => r.idempotency_key != null }],
      ingest_cycle_locks: [{ columns: ['lock_key'] }],
    },
  });

  const ml = createMercadoLibreCaptureAdapter({
    fetchItems: async (ids) =>
      new Map(ids.map((id) => [id, { id, title: 'Arroz blanco 1 kg', status: 'active', available_quantity: 50 }])),
    resolvePrice: async ({ itemId }): Promise<MercadoLibrePriceResolution> => {
      mlCalls += 1;
      t += opts.mlCostMs ?? 0;
      if (opts.mlFails) {
        return { status: 'error', price: null, originalPrice: null, regularPrice: null, promotionPrice: null, currency: null, source: 'none', confidence: 'low', resolvedBy: null, httpStatus: 500 };
      }
      void itemId;
      return { status: 'resolved', price: 34, originalPrice: null, regularPrice: null, promotionPrice: null, currency: opts.mlCurrency ?? 'MXN', source: 'items_prices', confidence: 'high', resolvedBy: 'items_prices', httpStatus: 200 };
    },
  });
  const amazon = createAmazonCaptureAdapter({
    loadConfig: () => ({
      amazonPaapiEnabled: opts.amazonEnabled ?? true,
      amazonSource: 'paapi',
      amazonPaapiAccessKey: 'AKIA_TEST_ONLY',
      amazonPaapiSecretKey: 'secret-test-only',
      amazonPaapiPartnerTag: 'partner-test-only',
      amazonPaapiHost: 'webservices.amazon.com.mx',
      amazonPaapiRegion: 'us-east-1',
    }),
    fetchItems: async (_cfg, asins) => ({
      ok: true,
      items: asins.map(
        (asin): PaapiItem => ({
          ASIN: asin,
          ItemInfo: { Title: { DisplayValue: 'Frijol negro 900 g' } },
          Offers: { Listings: [{ Price: { Amount: 28, Currency: 'MXN' }, Availability: { Type: 'Now' } }] },
        }),
      ),
    }),
  });
  const adapters: PriceCaptureAdapter[] = [ml, amazon];
  const supabase = memorySupabase(db);
  return {
    db,
    advance: (ms: number) => {
      t += ms;
    },
    mlCalls: () => mlCalls,
    deps: (override: Partial<ReturnType<typeof parsePriceCaptureConfig>> = {}) => {
      const base = parsePriceCaptureConfig(opts.config === null ? null : (opts.config ?? { enabled: true }));
      return {
        supabase,
        adapters,
        clock: () => t,
        config: opts.config === undefined || Object.keys(override).length ? { ...base, ...override } : undefined,
        log: () => undefined,
      };
    },
  };
}

function feedOffer(o: Partial<FeedOffer> & Pick<FeedOffer, 'id' | 'title'>): FeedOffer {
  return {
    price: 30,
    original_price: null,
    source_currency: null,
    offer_url: 'https://articulo.mercadolibre.com.mx/MLM-123456789-arroz',
    created_at: '2026-10-12T10:00:00.000Z',
    score: 0,
    up_votes: 0,
    down_votes: 0,
    ranking_blend: null,
    ranking_momentum: null,
    images: [],
    bank_coupon: null,
    store: 'Mercado Libre',
    category: 'supermercado',
    msi_months: null,
    description: null,
    hunter_comment: null,
    coupons: null,
    conditions: null,
    slug: o.id,
    created_by: null,
    expires_at: null,
    origin: 'community',
    author: { display_name: 'x', avatar_url: null, leader_badge: null, ml_tracking_tag: null, amazon_tracking_tag: null, slug: null },
    ...o,
  };
}
