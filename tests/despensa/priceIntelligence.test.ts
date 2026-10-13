import { describe, expect, it } from 'vitest';
import { savingEvidence } from '@/lib/despensa/evidence';
import { engineHistory, loadDespensaOffers } from '@/lib/despensa/despensaFeed';
import type { FeedOffer } from '@/lib/offers/feedService';
import {
  aggregateDailyObservations,
  anchorKey,
  classifyMlFailure,
  createMercadoLibreCaptureAdapter,
  ML_CAPTURE_LIMITS,
  readProductObservations,
  resolveCaptureItem,
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
    source_id: 'mercadolibre_mx',
    external_item_id: 'MLM123456789',
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

    // Con la pre-comprobación normal ni siquiera llama a la fuente (2 llamadas por corrida previa).
    const third = await runPriceCaptureCycle(env.deps());
    expect(third.skipped.captured_recently).toBe(2);
    expect(env.mlCalls()).toBe(4);
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

  it('15. una fuente falla: se registra el motivo, cada item queda aislado y la corrida termina', async () => {
    // Falla un item (500 dos veces: se reintenta una sola vez); los demás se capturan.
    const partial = captureEnv({ extraMlOffers: 2, mlFailItems: { MLM555000: [500, 500] } });
    const p = await runPriceCaptureCycle(partial.deps());
    expect(p.status).toBe('completed');
    expect(p.skipped.source_error).toBe(1);
    expect(p.inserted.valid).toBe(3);
    expect(partial.callsFor('MLM555000')).toBe(2);

    // Toda la fuente falla: tras 3 items fallidos seguidos se cierra solo en esta corrida.
    const env = captureEnv({ extraMlOffers: 4, mlFails: true });
    const r = await runPriceCaptureCycle(env.deps());
    expect(r.status).toBe('completed');
    expect(r.skipped.source_error).toBe(3);
    expect(r.skipped.source_circuit_open).toBe(3);
    expect(r.perSource.mercadolibre_mx).toEqual({ selected: 6, inserted: 0, failed: 6 });
    expect(captureRows(env.db)).toHaveLength(0);
    expect(r.events.filter((e) => e.sourceId === 'mercadolibre_mx').every((e) => e.outcome === 'skipped')).toBe(true);
  });

  it('16. presupuesto de tiempo agotado: se detiene y lo registra por candidato', async () => {
    const env = captureEnv({ extraMlOffers: 2, mlCostMs: 25_000 });
    const r = await runPriceCaptureCycle(env.deps({ budgetMs: 40_000 }));
    expect(r.budgetExhausted).toBe(true);
    expect(r.inserted.valid).toBe(2);
    expect(r.skipped.time_budget_exhausted).toBe(2);
    expect(r.events.filter((e) => e.reason === 'time_budget_exhausted').map((e) => e.sourceId)).toEqual([
      'mercadolibre_mx',
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

  it('respeta el tiempo que le queda a la función que la invoca (cron)', async () => {
    // Quedan 20 s: tras el margen de 15 s no alcanza para empezar; no toma el lock ni escribe.
    const tight = captureEnv();
    const t = await runPriceCaptureCycle({ ...tight.deps(), hostDeadlineMs: tight.now().getTime() + 20_000 });
    expect(t).toMatchObject({ status: 'skipped_time', detail: 'host_time_insufficient' });
    expect(tight.db.writes).toEqual([]);
    expect(tight.mlCalls()).toBe(0);

    // Quedan 45 s: el presupuesto baja de 60 s a 30 s y la corrida termina normal.
    const some = captureEnv();
    const s = await runPriceCaptureCycle({ ...some.deps(), hostDeadlineMs: some.now().getTime() + 45_000 });
    expect(s.status).toBe('completed');
    expect(s.budgetMs).toBe(30_000);
    expect(s.inserted.valid).toBe(2);

    // Apagada: ni siquiera calcula el tiempo.
    const off = captureEnv({ config: null });
    expect((await runPriceCaptureCycle({ ...off.deps(), hostDeadlineMs: 0 })).status).toBe('disabled');
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

  it('fuentes sin API autorizada se omiten con motivo; Amazon PA-API está retirada y no se puede encender', async () => {
    // Amazon, Soriana y lo que no es despensa ni siquiera se leen: el filtro de fuente va en SQL.
    const plain = captureEnv();
    const p = await runPriceCaptureCycle(plain.deps());
    expect(p.coverage).toMatchObject({ scannedOffers: 2, eligibleProducts: 2, scanComplete: true });
    expect(p.events.some((e) => ['amz1', 'sor1', 'tech1'].includes(e.offerId))).toBe(false);

    // Si una oferta de otra tienda pasa el filtro (huella «ml:» pegada por error), el chequeo por
    // URL la sigue frenando con su motivo.
    const env = captureEnv({
      offers: [
        offerRow('ml1', 'Arroz blanco 1 kg', 'https://articulo.mercadolibre.com.mx/MLM-123456789-arroz', 34, 'ml:MLM123456789'),
        offerRow('amz1', 'Frijol negro 900 g', 'https://www.amazon.com.mx/dp/B000TEST01', 28, 'ml:MLM000000001'),
        offerRow('sor1', 'Aceite vegetal 1 L', 'https://www.soriana.com/p/1', 45, 'ml:MLM000000002'),
      ],
    });
    const r = await runPriceCaptureCycle(env.deps());
    expect(r.skipped.source_not_supported).toBe(1);
    expect(r.skipped.source_retired).toBe(1);
    expect(r.events).toContainEqual({ offerId: 'sor1', sourceId: 'soriana_mx', outcome: 'skipped', reason: 'source_not_supported' });
    expect(r.events).toContainEqual({ offerId: 'amz1', sourceId: 'amazon_mx', outcome: 'skipped', reason: 'source_retired' });
    expect(new Set(captureRows(env.db).map((x) => x.source_id))).toEqual(new Set(['mercadolibre_mx']));
    expect(env.resolveCalls.map((c) => c.itemId)).toEqual(['MLM123456789']);
    // Ni la configuración puede activarla.
    expect(parsePriceCaptureConfig({ enabled: true, sources: ['amazon_mx', 'mercadolibre_mx'] }).sources).toEqual(['mercadolibre_mx']);
    expect(parsePriceCaptureConfig({ enabled: true, sources: ['amazon_mx'] }).sources).toEqual([]);
  });

  it('respeta los topes por fuente y por corrida', async () => {
    // Candidatos de Mercado Libre (más nuevos primero): ml1, ml2, mlx0…mlx4.
    const bySource = await runPriceCaptureCycle(captureEnv({ extraMlOffers: 5 }).deps({ maxPerSource: { mercadolibre_mx: 2 }, maxCandidates: 10 }));
    expect(bySource.selected).toBe(2);
    expect(bySource.perSource.mercadolibre_mx?.selected).toBe(2);
    expect(bySource.skipped.over_source_cap).toBe(5);

    const byRun = await runPriceCaptureCycle(captureEnv({ extraMlOffers: 5 }).deps({ maxCandidates: 1 }));
    expect(byRun.selected).toBe(1);
    expect(byRun.skipped.over_run_cap).toBe(6);
  });

  it('la fila guardada declara procedencia, validación e idempotencia sin datos sensibles', async () => {
    const env = captureEnv();
    await runPriceCaptureCycle(env.deps());
    const ml = captureRows(env.db).find((x) => x.external_item_id === 'MLM123456789')!;
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
      policy_version: 'price-observation-v2',
      idempotency_key: observationIdempotencyKey({
        sourceId: 'mercadolibre_mx',
        externalItemId: 'MLM123456789',
        scope: { kind: 'online', label: 'MX' },
        observedAtMs: NOW.getTime(),
      }),
    });
    expect(ml.idempotency_key).not.toContain('ml1');
    expect(ml.provenance).toMatchObject({ catalog_product_id: null, anchor_offer_expired: false, offer_price_at_capture: 34 });
    expect(JSON.stringify(ml)).not.toMatch(/token|secret|cookie|authorization/i);
  });

  it('una moneda distinta de MXN se guarda como inválida y no cuenta', async () => {
    const env = captureEnv({ mlCurrency: 'USD' });
    const r = await runPriceCaptureCycle(env.deps());
    expect(r.inserted.invalid).toBe(2);
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

describe('continuidad del producto entre ofertas', () => {
  const ANCHOR = { sourceId: 'mercadolibre_mx' as const, externalItemId: 'MLM123456789' };

  it('una oferta nueva del mismo producto no reinicia el historial', async () => {
    const rows = [row(0.1, 34, { offer_id: 'nueva' }), ...PRIOR_40().map((r, i) => ({ ...r, offer_id: `vieja${i % 2}` }))];
    const supabase = memorySupabase(createMemoryDb({ tables: { offer_price_snapshots: rows } }));

    const product = await readProductObservations(supabase, [ANCHOR], { now: NOW });
    const h = product.byAnchor.get(anchorKey(ANCHOR));
    expect(h).toMatchObject({ complete: true });
    expect(h?.rows).toHaveLength(6);
    const e = evaluatePriceHistory({ rows: h!.rows, historyComplete: true, currentPrice: 34, originalPrice: null, now: NOW, expect: ARROZ });
    expect(e.label).toBe('verified_saving');

    // Contraste: por oferta, la nueva solo tiene su propia captura.
    const byOffer = await readOfferObservations(supabase, ['nueva'], { now: NOW, onlyCapture: true });
    expect(evaluate(byOffer.byOffer.get('nueva')!.rows).reasons).toEqual(['single_observation']);
  });

  it('caducidad sin pérdida: 22 días con ofertas de 7 días llegan a ahorro verificado', async () => {
    const START = Date.parse('2026-09-01T16:00:00.000Z');
    const URL = 'https://articulo.mercadolibre.com.mx/MLM-123456789-arroz';
    const at = (d: number) => new Date(START + d * DAY).toISOString();
    const publish: Record<number, ReturnType<typeof offerRow>> = {
      0: { ...offerRow('o1', 'Arroz blanco 1 kg', URL, 40), created_at: at(0), expires_at: at(7) },
      7: { ...offerRow('o2', 'Arroz blanco 1 kg', URL, 40), created_at: at(7), expires_at: at(14) },
      14: { ...offerRow('o3', 'Arroz blanco 1 kg', URL, 40), created_at: at(14), expires_at: at(21) },
      18: { ...offerRow('o4', 'Arroz blanco 1 kg', URL, 34), created_at: at(18), expires_at: at(25) },
    };
    const env = captureEnv({ offers: [], startMs: START, mlPriceAt: (_id, ms) => (ms >= START + 18 * DAY ? 34 : 40) });
    const anchoredTo: string[] = [];
    for (let d = 0; d <= 21; d += 1) {
      if (publish[d]) env.db.tables.offers.push(publish[d]);
      const r = await runPriceCaptureCycle(env.deps());
      expect(r.inserted.valid).toBe(1);
      anchoredTo.push(captureRows(env.db).at(-1)!.offer_id as string);
      if (d < 21) env.advance(DAY);
    }
    expect(anchoredTo).toEqual([...Array(7).fill('o1'), ...Array(7).fill('o2'), ...Array(4).fill('o3'), ...Array(4).fill('o4')]);
    // Las ofertas no se tocaron.
    expect(env.db.tables.offers.map((o) => o.price)).toEqual([40, 40, 40, 34]);

    const supabase = memorySupabase(env.db);
    const now = env.now();
    const h = (await readProductObservations(supabase, [ANCHOR], { now })).byAnchor.get(anchorKey(ANCHOR))!;
    expect(h.rows).toHaveLength(22);
    const e = evaluatePriceHistory({ rows: h.rows, historyComplete: h.complete, currentPrice: 34, originalPrice: null, now, expect: ARROZ });
    expect(e).toMatchObject({ label: 'verified_saving', savingAmount: 6, reference: { kind: 'own_history_median', price: 40 } });

    // Sin continuidad (solo la oferta vigente) no habría evidencia suficiente.
    const only = (await readOfferObservations(supabase, ['o4'], { now, onlyCapture: true })).byOffer.get('o4')!;
    const e4 = evaluatePriceHistory({ rows: only.rows, historyComplete: true, currentPrice: 34, originalPrice: null, now, expect: ARROZ });
    expect(e4.label).not.toBe('verified_saving');
    expect(e4.reasons).toEqual(['insufficient_history']);
  });

  it('una oferta caducada se sigue capturando 45 días; después, no', async () => {
    const URL = 'https://articulo.mercadolibre.com.mx/MLM-123456789-arroz';
    const recent = captureEnv({ offers: [{ ...offerRow('vieja', 'Arroz blanco 1 kg', URL, 34), expires_at: iso(10) }] });
    const r = await runPriceCaptureCycle(recent.deps());
    expect(r.trackedAfterExpiry).toBe(1);
    expect(r.inserted.valid).toBe(1);
    expect(captureRows(recent.db)[0].provenance).toMatchObject({ anchor_offer_expired: true });

    const old = captureEnv({ offers: [{ ...offerRow('vieja', 'Arroz blanco 1 kg', URL, 34), expires_at: iso(50) }] });
    const o = await runPriceCaptureCycle(old.deps());
    // La ventana se aplica en SQL: la oferta ni se lee.
    expect(o.coverage).toMatchObject({ scannedOffers: 0, eligibleProducts: 0, scanComplete: true });
    expect(o.detail).toBe('no_candidates');
    expect(old.mlCalls()).toBe(0);
    expect(captureRows(old.db)).toHaveLength(0);
  });

  it('dos ofertas del mismo producto: una sola captura por día, anclada a la vigente más nueva', async () => {
    const URL = 'https://articulo.mercadolibre.com.mx/MLM-123456789-arroz';
    const env = captureEnv({
      offers: [
        { ...offerRow('caducada-nueva', 'Arroz blanco 1 kg', URL, 34), created_at: iso(1), expires_at: iso(0.5) },
        { ...offerRow('vigente', 'Arroz blanco 1 kg', URL, 34), created_at: iso(3) },
        { ...offerRow('vigente-vieja', 'Arroz blanco 1 kg', `${URL}?ref=x`, 34), created_at: iso(5) },
      ],
    });
    const r = await runPriceCaptureCycle(env.deps());
    expect(r.selected).toBe(1);
    expect(r.skipped.same_product_other_offer).toBe(2);
    expect(env.mlCalls()).toBe(1);
    expect(captureRows(env.db).map((x) => x.offer_id)).toEqual(['vigente']);
  });
});

describe('separación e integridad de la serie', () => {
  const ARROZ_500 = readProduct('Arroz blanco 500 g');
  const ID_500 = identityKey({ sourceId: 'mercadolibre_mx', externalItemId: 'MLM123456789', ...ARROZ_500 });
  const as500 = (r: StoredObservationRow) => ({ ...r, identity_key: ID_500, presentation_key: ARROZ_500.presentationKey });

  it('otra presentación del mismo item no se mezcla con la serie de la oferta', () => {
    const rows = [row(0.1, 34), ...PRIOR_40(), ...[11, 16, 21, 26].map((d) => as500(row(d, 20)))];
    const e = evaluatePriceHistory({ rows, historyComplete: true, currentPrice: 34, originalPrice: null, now: NOW, expect: ARROZ });
    expect(e.excluded.different_identity).toBe(4);
    expect(e.reference?.price).toBe(40);

    const only500 = [as500(row(0.1, 18)), ...[10, 15, 20, 25].map((d) => as500(row(d, 20)))];
    const m = evaluatePriceHistory({ rows: only500, historyComplete: true, currentPrice: 34, originalPrice: null, now: NOW, expect: ARROZ });
    expect(m.reasons).toEqual(['offer_identity_mismatch']);
    expect(verified(m)).toBe(false);
  });

  it('presentación de la oferta desconocida: puede mostrar precio, nunca ahorro verificado', () => {
    const e = evaluatePriceHistory({
      rows: [row(0.1, 34), ...PRIOR_40()],
      historyComplete: true,
      currentPrice: 34,
      originalPrice: null,
      now: NOW,
      expect: { ...ARROZ, presentationKey: null },
    });
    expect(e.reasons).toEqual(['offer_presentation_unknown']);
    expect(verified(e)).toBe(false);
  });

  it('historial con huecos: cuenta días reales, no rellena', () => {
    // Cuatro días seguidos: abarcan 3 días, no 14.
    expect(evaluate([row(0.1, 34), row(20, 40), row(21, 40), row(22, 40), row(23, 40)]).reasons).toEqual(['insufficient_history']);
    // Tres días previos con un hueco grande: faltan observaciones.
    expect(evaluate([row(0.1, 34), row(15, 40), row(40, 40), row(41, 40)]).reasons).toEqual(['insufficient_history']);
    // Varias capturas el mismo día cuentan como una.
    expect(evaluate([row(0.1, 34), row(20, 40), row(20.1, 40), row(20.2, 40), row(35, 40)]).reasons).toEqual(['insufficient_history']);
    // Cuatro días distintos que abarcan ≥14 días: sí.
    expect(evaluate([row(0.1, 34), row(15, 40), row(16, 40), row(30, 40), row(31, 40)]).label).toBe('verified_saving');
  });

  it('lectura de producto incompleta: no se afirma nada', async () => {
    const db = createMemoryDb({ tables: { offer_price_snapshots: [row(0.1, 34), ...PRIOR_40()] } });
    db.failOn.offer_price_snapshots = { op: 'select', error: { code: '57014', message: 'timeout' } };
    const anchor = { sourceId: 'mercadolibre_mx' as const, externalItemId: 'MLM123456789' };
    const res = await readProductObservations(memorySupabase(db), [anchor], { now: NOW });
    expect(res.failedChunks).toBe(1);
    const h = res.byAnchor.get(anchorKey(anchor));
    expect(h?.complete ?? false).toBe(false);
    const e = evaluatePriceHistory({ rows: h?.rows ?? [], historyComplete: h?.complete ?? false, currentPrice: 34, originalPrice: null, now: NOW, expect: ARROZ });
    expect(e.reasons).toEqual(['history_incomplete']);
  });

  it('disponibilidad: desconocida no verifica, limitada sí, agotada no es precio vigente', () => {
    const unknown = evaluate([row(0.1, 34, { availability: 'unknown' }), ...PRIOR_40()]);
    expect(unknown.reasons).toEqual(['availability_unconfirmed']);
    expect(unknown.label).toBe('observed_price');
    expect(verified(unknown)).toBe(false);

    expect(evaluate([row(0.1, 34, { availability: 'limited' }), ...PRIOR_40()]).label).toBe('verified_saving');
    expect(verified(evaluate([row(0.1, 34, { availability: 'out_of_stock' }), ...PRIOR_40()]))).toBe(false);
  });

  it('observaciones inválidas o en cuarentena no son vigentes ni referencia', () => {
    const invalidNow = evaluate([row(0.1, 34, { validation_status: 'invalid', validation_reasons: ['presentation_mismatch'] }), ...PRIOR_40()]);
    expect(verified(invalidNow)).toBe(false);
    const quarantined = evaluate([row(0.1, 34), ...PRIOR_40().map((r) => ({ ...r, validation_status: 'quarantined' }))]);
    expect(verified(quarantined)).toBe(false);
  });
});

describe('precio publicado frente al observado', () => {
  it('la tienda muestra un precio menor: se informa, no se calcula ahorro y la oferta no cambia', async () => {
    const e = evaluate([row(0.1, 30), ...PRIOR_40()], 34);
    expect(e).toMatchObject({ label: 'price_differs', priceRelation: 'observed_lower', current: { price: 30 } });
    expect(e.reasons).toEqual(['current_price_mismatch']);
    const ev = savingEvidence({ price: 34, history: engineHistory(e) });
    expect(ev).toMatchObject({ status: 'price_differs', observedPrice: 30 });

    const now = new Date();
    const offers = [{ id: 'o1', source_currency: 'MXN', price: 34, product_fingerprint: 'ml:MLM123456789' }];
    const db = createMemoryDb({ tables: { offers, offer_price_snapshots: [row(0.05, 30, {}, now), ...[10, 15, 20, 25, 30].map((d) => row(d, 40, {}, now))] } });
    const out = await loadDespensaOffers(memorySupabase(db), [feedOffer({ id: 'o1', title: 'Arroz blanco 1 kg', price: 34 })]);
    expect(out.offers[0].priceHistory?.engine).toMatchObject({ label: 'price_differs', priceRelation: 'observed_lower' });
    expect(db.tables.offers).toEqual([{ id: 'o1', source_currency: 'MXN', price: 34, product_fingerprint: 'ml:MLM123456789' }]);
  });

  it('la promoción terminó (precio observado mayor): sin ahorro', () => {
    const e = evaluate([row(0.1, 40), ...PRIOR_40()], 34);
    expect(e).toMatchObject({ label: 'price_differs', priceRelation: 'observed_higher' });
    expect(verified(e)).toBe(false);
  });

  it('observación vieja: no se compara con el precio publicado', () => {
    const e = evaluate([row(3, 34), ...PRIOR_40()], 34);
    expect(e.reasons).toEqual(['current_stale']);
    expect(e.priceRelation).toBeNull();
    expect(verified(e)).toBe(false);
  });

  it('diferencia de centavos por redondeo: coincide', () => {
    const e = evaluate([row(0.1, 34.004), ...PRIOR_40()], 34);
    expect(e.priceRelation).toBe('matches');
  });
});

describe('Mercado Libre: catálogo y autorización', () => {
  it('resuelve el item exacto y propaga el producto de catálogo; sin item no adivina', async () => {
    expect(resolveCaptureItem('mercadolibre_mx', { offerUrl: 'https://articulo.mercadolibre.com.mx/MLM-123456789-arroz', productFingerprint: null })).toMatchObject({
      ok: true,
      externalItemId: 'MLM123456789',
      catalogProductId: null,
    });
    expect(resolveCaptureItem('mercadolibre_mx', { offerUrl: 'https://www.mercadolibre.com.mx/arroz/p/MLM111222333?wid=MLM444555666', productFingerprint: null })).toMatchObject({
      ok: true,
      externalItemId: 'MLM444555666',
      catalogProductId: 'MLM111222333',
    });
    expect(resolveCaptureItem('mercadolibre_mx', { offerUrl: 'https://www.mercadolibre.com.mx/arroz/p/MLM111222333', productFingerprint: 'ml:MLM111222333' })).toEqual({
      ok: false,
      reason: 'catalog_without_item',
    });

    const env = captureEnv({
      offers: [
        offerRow('cat', 'Arroz blanco 1 kg', 'https://www.mercadolibre.com.mx/arroz/p/MLM111222333?wid=MLM444555666', 34),
        offerRow('item', 'Frijol negro 900 g', 'https://articulo.mercadolibre.com.mx/MLM-987654321-frijol', 28),
        offerRow('solo-cat', 'Arroz blanco 1 kg', 'https://www.mercadolibre.com.mx/arroz/p/MLM777888999', 34),
      ],
    });
    const r = await runPriceCaptureCycle(env.deps());
    expect(r.skipped.catalog_without_item).toBe(1);
    expect(env.resolveCalls).toHaveLength(2);
    expect(env.resolveCalls).toEqual(
      expect.arrayContaining([
        { itemId: 'MLM444555666', catalogProductId: 'MLM111222333' },
        { itemId: 'MLM987654321', catalogProductId: null },
      ]),
    );
    const cat = captureRows(env.db).find((x) => x.offer_id === 'cat');
    expect(cat).toMatchObject({ external_item_id: 'MLM444555666' });
    expect(cat?.provenance).toMatchObject({ catalog_product_id: 'MLM111222333' });
  });

  it('clasifica las fallas por código HTTP', () => {
    const c = (status: MercadoLibrePriceResolution['status'], http: number | null) => classifyMlFailure({ status, httpStatus: http });
    expect(c('unavailable', 401)).toBe('source_unauthorized');
    expect(c('unauthorized', 403)).toBe('source_unauthorized');
    expect(c('unavailable', 429)).toBe('source_rate_limited');
    expect(c('unavailable', 404)).toBe('item_not_found');
    expect(c('unavailable', 503)).toBe('source_error');
    expect(c('unavailable', 0)).toBe('source_error');
    expect(c('error', null)).toBe('source_error');
    expect(c('unavailable', 200)).toBe('price_unavailable');
    expect(ML_CAPTURE_LIMITS).toEqual({ unauthorizedInARow: 3, errorsInARow: 3, transientRetries: 1 });
  });

  it('401/403: sin reintento, se cierra en la corrida y vuelve a intentarse en la siguiente', async () => {
    // Todos los items responden 401/403 la primera vez (el orden de captura es por prioridad).
    const env = captureEnv({
      extraMlOffers: 3,
      mlFailItems: { MLM123456789: [403], MLM987654321: [401], MLM555000: [403], MLM555001: [401], MLM555002: [403] },
    });
    const first = await runPriceCaptureCycle(env.deps());
    expect(first.skipped.source_unauthorized).toBe(3);
    expect(first.skipped.source_circuit_open).toBe(2);
    expect(env.mlCalls()).toBe(3);
    expect(captureRows(env.db)).toHaveLength(0);

    // Al día siguiente se reintenta todo: los 3 ya fallidos responden bien; los 2 que no se
    // llegaron a intentar dan su 401/403 (dos seguidos no cierran la fuente).
    env.advance(DAY);
    const second = await runPriceCaptureCycle(env.deps());
    expect(second.inserted.valid).toBe(3);
    expect(second.skipped.source_unauthorized).toBe(2);
    expect(second.skipped.source_circuit_open ?? 0).toBe(0);
    expect(env.mlCalls()).toBe(3 + 5);

    env.advance(DAY);
    const third = await runPriceCaptureCycle(env.deps());
    expect(third.skipped.source_unauthorized ?? 0).toBe(0);
    expect(third.inserted.valid).toBe(5);
    expect(new Set(captureRows(env.db).map((x) => x.external_item_id)).size).toBe(5);
  });

  it('un 403 aislado no cierra la fuente', async () => {
    const env = captureEnv({ extraMlOffers: 2, mlFailItems: { MLM987654321: [403] } });
    const r = await runPriceCaptureCycle(env.deps());
    expect(r.skipped.source_unauthorized).toBe(1);
    expect(r.skipped.source_circuit_open ?? 0).toBe(0);
    expect(r.inserted.valid).toBe(3);
  });

  it('429: cierra la fuente de inmediato y sin reintentos', async () => {
    const env = captureEnv({
      extraMlOffers: 2,
      mlFailItems: { MLM123456789: [429], MLM987654321: [429], MLM555000: [429], MLM555001: [429] },
    });
    const r = await runPriceCaptureCycle(env.deps());
    expect(r.skipped.source_rate_limited).toBe(1);
    expect(r.skipped.source_circuit_open).toBe(3);
    expect(env.mlCalls()).toBe(1);
  });

  it('404 y 200 incompleto quedan aislados en su item', async () => {
    const env = captureEnv({ extraMlOffers: 1, mlFailItems: { MLM123456789: [404] }, mlIncomplete: ['MLM987654321'] });
    const r = await runPriceCaptureCycle(env.deps());
    expect(r.skipped.item_not_found).toBe(1);
    expect(r.skipped.price_unavailable).toBe(1);
    expect(r.inserted.valid).toBe(1);
    expect(env.callsFor('MLM123456789')).toBe(1);
  });

  it('respuesta sin moneda legible: se guarda inválida, nunca rompe el CHECK de la base', async () => {
    const env = captureEnv({ mlCurrency: 'pesos' });
    const r = await runPriceCaptureCycle(env.deps());
    expect(r.inserted.invalid).toBe(2);
    for (const x of captureRows(env.db)) {
      expect(x.currency).toBeNull();
      expect(x.validation_reasons).toContain('currency_unconfirmed');
    }
  });
});

describe('compatibilidad con Price Memory y Canasta Básica', () => {
  it('la captura no escribe en Price Memory ni en ofertas', async () => {
    const env = captureEnv({ extraMlOffers: 1 });
    env.db.tables.product_price_snapshots = [{ id: 'pm1', marketplace: 'mercadolibre', item_id: 'MLM123456789', last_price: 50 }];
    const before = JSON.stringify(env.db.tables.offers);
    await runPriceCaptureCycle(env.deps());
    expect(env.db.tables.product_price_snapshots).toEqual([{ id: 'pm1', marketplace: 'mercadolibre', item_id: 'MLM123456789', last_price: 50 }]);
    expect(JSON.stringify(env.db.tables.offers)).toBe(before);
  });

  it('Despensa con ofertas sin item externo no depende de la lectura de historial', async () => {
    const feed = [feedOffer({ id: 's1', title: 'Arroz blanco 1 kg', price: 30, offer_url: 'https://www.soriana.com/p/1', store: 'Soriana' })];
    const ok = createMemoryDb({ tables: { offers: [{ id: 's1', source_currency: 'MXN' }], offer_price_snapshots: [] } });
    const broken = createMemoryDb({ tables: { offers: [{ id: 's1', source_currency: 'MXN' }], offer_price_snapshots: [] } });
    broken.failOn.offer_price_snapshots = { op: 'select', error: { code: '57014', message: 'timeout' } };
    const a = await loadDespensaOffers(memorySupabase(ok), feed);
    const b = await loadDespensaOffers(memorySupabase(broken), feed);
    expect(b.offers[0].priceHistory).toEqual(a.offers[0].priceHistory);
    expect(a.offers[0].priceHistory?.engine?.label).not.toBe('verified_saving');
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
    expires_at: null as string | null,
    created_at: '2026-10-10T00:00:00.000Z',
  };
}

type MlReply = number | 'resolved';

type EnvOpts = {
  config?: Record<string, unknown> | null;
  extraMlOffers?: number;
  mlFails?: boolean;
  /** Respuestas HTTP por item, en orden de llamada; después de agotarlas, responde bien. */
  mlFailItems?: Record<string, MlReply[]>;
  mlCostMs?: number;
  mlCurrency?: string;
  /** Precio que devuelve la tienda por item (por defecto, el de su oferta). */
  mlPrices?: Record<string, number>;
  /** Precio en función del reloj simulado (para series de varias semanas). */
  mlPriceAt?: (itemId: string, nowMs: number) => number;
  /** Respuesta 200 sin precio legible. */
  mlIncomplete?: string[];
  offers?: ReturnType<typeof offerRow>[];
  startMs?: number;
  /** false: la función `price_capture_product_stats` no existe (migración sin aplicar). */
  statsRpc?: boolean;
};

/** Réplica en memoria de `price_capture_product_stats` (misma semántica que el SQL). */
function productStatsRpc(args: Record<string, unknown>, db: MemoryDb) {
  const items = new Set(args.p_item_ids as string[]);
  const since = String(args.p_since);
  const out = new Map<string, { external_item_id: string; last_recorded_at: string; days: Set<string>; first_valid_at: string | null; last_valid_at: string | null }>();
  for (const r of db.tables.offer_price_snapshots ?? []) {
    if (r.source !== 'capture' || r.source_id !== args.p_source_id || !items.has(String(r.external_item_id))) continue;
    const at = String(r.recorded_at);
    if (at < since) continue;
    const id = String(r.external_item_id);
    const s = out.get(id) ?? { external_item_id: id, last_recorded_at: at, days: new Set<string>(), first_valid_at: null, last_valid_at: null };
    if (at > s.last_recorded_at) s.last_recorded_at = at;
    if (r.validation_status === 'valid' && r.availability !== 'out_of_stock') {
      s.days.add(at.slice(0, 10));
      if (!s.first_valid_at || at < s.first_valid_at) s.first_valid_at = at;
      if (!s.last_valid_at || at > s.last_valid_at) s.last_valid_at = at;
    }
    out.set(id, s);
  }
  return {
    data: [...out.values()].map(({ days, ...s }) => ({ ...s, valid_days: days.size })),
    error: null,
  };
}

const ML_TITLES: Record<string, string> = { MLM123456789: 'Arroz blanco 1 kg', MLM987654321: 'Frijol negro 900 g' };
const ML_PRICES: Record<string, number> = { MLM123456789: 34, MLM987654321: 28 };

function mlResolution(status: MercadoLibrePriceResolution['status'], httpStatus: number | null, price: number | null = null, currency: string | null = null): MercadoLibrePriceResolution {
  return {
    status,
    price,
    originalPrice: null,
    regularPrice: null,
    promotionPrice: null,
    currency,
    source: price != null ? 'items_prices' : 'none',
    confidence: price != null ? 'high' : 'low',
    resolvedBy: price != null ? 'items_prices' : null,
    httpStatus,
  };
}

function captureEnv(opts: EnvOpts = {}) {
  let t = opts.startMs ?? NOW.getTime();
  let mlCalls = 0;
  const calls = new Map<string, number>();
  const resolveCalls: { itemId: string; catalogProductId: string | null }[] = [];
  const offers =
    opts.offers ??
    [
      offerRow('ml1', 'Arroz blanco 1 kg', 'https://articulo.mercadolibre.com.mx/MLM-123456789-arroz', 34, 'ml:MLM123456789'),
      offerRow('ml2', 'Frijol negro 900 g', 'https://articulo.mercadolibre.com.mx/MLM-987654321-frijol', 28, 'ml:MLM987654321'),
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
  if (opts.statsRpc !== false) db.rpcHandlers = { price_capture_product_stats: productStatsRpc };

  const ml = createMercadoLibreCaptureAdapter({
    fetchItems: async (ids) =>
      new Map(ids.map((id) => [id, { id, title: ML_TITLES[id] ?? 'Arroz blanco 1 kg', status: 'active', available_quantity: 50 }])),
    resolvePrice: async ({ itemId, catalogProductId }): Promise<MercadoLibrePriceResolution> => {
      mlCalls += 1;
      const n = calls.get(itemId) ?? 0;
      calls.set(itemId, n + 1);
      resolveCalls.push({ itemId, catalogProductId: catalogProductId ?? null });
      t += opts.mlCostMs ?? 0;
      if (opts.mlFails) return mlResolution('error', 500);
      const scripted = opts.mlFailItems?.[itemId]?.[n];
      if (typeof scripted === 'number') {
        return mlResolution(scripted === 401 || scripted === 403 ? 'unauthorized' : 'unavailable', scripted);
      }
      if (opts.mlIncomplete?.includes(itemId)) return mlResolution('unavailable', 200);
      const price = opts.mlPriceAt?.(itemId, t) ?? opts.mlPrices?.[itemId] ?? ML_PRICES[itemId] ?? 34;
      return mlResolution('resolved', 200, price, opts.mlCurrency ?? 'MXN');
    },
  });
  const adapters: PriceCaptureAdapter[] = [ml];
  const supabase = memorySupabase(db);
  return {
    db,
    advance: (ms: number) => {
      t += ms;
    },
    now: () => new Date(t),
    mlCalls: () => mlCalls,
    callsFor: (itemId: string) => calls.get(itemId) ?? 0,
    resolveCalls,
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
