import { describe, expect, it } from 'vitest';
import {
  buildBotFacts,
  buildBotScoreChips,
  buildModerationChecklist,
  countChecklistBlockers,
  parseBotMeta,
  parseLegacyScoreBreakdown,
} from '@/lib/moderation/botFacts';

describe('parseLegacyScoreBreakdown', () => {
  it('lee el desglose embebido en el comentario del bot', () => {
    const parsed = parseLegacyScoreBreakdown(
      '[bot-ingest v3] score=56 (moderación) | d53 p58 r60 c35 $88 | cat=hogar'
    );
    expect(parsed).toEqual({
      discount: 53,
      popularity: 58,
      rating: 60,
      category: 35,
      priceAppeal: 88,
    });
  });

  it('devuelve null en comentarios humanos', () => {
    expect(parseLegacyScoreBreakdown('Buena oferta, aprobada')).toBeNull();
    expect(parseLegacyScoreBreakdown(null)).toBeNull();
  });
});

describe('buildBotScoreChips', () => {
  it('traduce el desglose a lenguaje humano', () => {
    const chips = buildBotScoreChips({
      moderatorComment: '[bot-ingest v3] score=56 (moderación) | d53 p58 r60 c35 $88',
    });
    const byLabel = Object.fromEntries(chips.map((c) => [c.label, c]));
    expect(byLabel['Descuento'].verdict).toBe('medio');
    expect(byLabel['Precio'].verdict).toBe('bueno');
    expect(byLabel['Categoría'].verdict).toBe('flojo');
  });

  it('prefiere bot_meta sobre el comentario legado', () => {
    const chips = buildBotScoreChips({
      botMeta: parseBotMeta({ score: { discount: 95 } }),
      moderatorComment: 'd10 p10 r10 c10 $10',
    });
    expect(chips).toHaveLength(1);
    expect(chips[0].label).toBe('Descuento');
    expect(chips[0].level).toBe('good');
  });

  it('no rompe sin datos', () => {
    expect(buildBotScoreChips({})).toEqual([]);
  });
});

describe('parseBotMeta', () => {
  it('ignora valores basura', () => {
    const meta = parseBotMeta({
      source: 'ml_worker',
      score: { total: 'x', discount: 53 },
      signals: { soldQuantity: 1200, ratingAverage: null },
    });
    expect(meta?.source).toBe('ml_worker');
    expect(meta?.score?.total).toBeNull();
    expect(meta?.score?.discount).toBe(53);
    expect(meta?.signals?.soldQuantity).toBe(1200);
  });

  it('devuelve null si no es objeto', () => {
    expect(parseBotMeta(null)).toBeNull();
    expect(parseBotMeta('texto')).toBeNull();
    expect(parseBotMeta([1, 2])).toBeNull();
  });
});

describe('buildBotFacts', () => {
  it('describe las señales en español', () => {
    const facts = buildBotFacts(
      parseBotMeta({
        signals: {
          soldQuantity: 1200,
          ratingAverage: 4.6,
          ratingCount: 340,
          condition: 'new',
          savingsVsHabitualPct: 25,
          suspectedArtificialListPrice: true,
        },
      })
    );
    const map = Object.fromEntries(facts.map((f) => [f.key, f]));
    expect(map.sold.value).toContain('1,200');
    expect(map.rating.value).toBe('4.6 de 5 (340)');
    expect(map.condition.value).toBe('Nuevo');
    expect(map['vs-habitual'].value).toBe('25% más barato');
    expect(map['fake-list-price'].tone).toBe('warn');
  });

  it('no inventa datos', () => {
    expect(buildBotFacts(null)).toEqual([]);
    expect(buildBotFacts(parseBotMeta({}))).toEqual([]);
  });
});

describe('buildModerationChecklist', () => {
  it('avisa foto faltante sin bloquear (ficha del bot basta para decidir)', () => {
    process.env.ML_AFFILIATE_TAG = 'aventa_test';
    const items = buildModerationChecklist({
      title: 'Cerveza Clara Modelo Especial 24 Latas',
      image_url: '',
      offer_url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-1?tag=aventa_test',
      category: 'supermercado',
    });
    const map = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(map.photo.state).toBe('warn');
    expect(map.link.state).toBe('ok');
    expect(map.affiliate.state).toBe('ok');
    expect(map.category.state).toBe('ok');
    expect(map.category.detail).toContain('Día a día');
    expect(map.title.state).toBe('ok');
    expect(countChecklistBlockers(items)).toBe(0);
  });

  it('avisa enlace sin tag de afiliado sin bloquear (se aplica al aprobar)', () => {
    process.env.ML_AFFILIATE_TAG = 'aventa_test';
    const items = buildModerationChecklist({
      title: 'Producto',
      image_url: 'https://http2.mlstatic.com/a.jpg',
      offer_url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-1',
      category: 'hogar',
    });
    expect(items.find((i) => i.id === 'affiliate')?.state).toBe('warn');
    expect(countChecklistBlockers(items)).toBe(0);
  });

  it('avisa acortador meli.la sin bloquear (se resuelve al aprobar)', () => {
    process.env.ML_AFFILIATE_TAG = 'aventa_test';
    const items = buildModerationChecklist({
      title: 'Producto corto',
      image_url: 'https://http2.mlstatic.com/a.jpg',
      offer_url: 'https://meli.la/abc123',
      category: 'hogar',
    });
    expect(items.find((i) => i.id === 'affiliate')?.state).toBe('warn');
    expect(countChecklistBlockers(items)).toBe(0);
  });

  it('acepta foto desde image_urls', () => {
    process.env.ML_AFFILIATE_TAG = 'aventa_test';
    const items = buildModerationChecklist({
      title: 'Audífonos',
      image_url: null,
      image_urls: ['https://http2.mlstatic.com/a.jpg'],
      offer_url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-1?tag=aventa_test',
      category: 'tecnologia',
    });
    expect(items.find((i) => i.id === 'photo')?.state).toBe('ok');
    expect(countChecklistBlockers(items)).toBe(0);
  });

  it('avisa de título largo sin bloquear', () => {
    process.env.ML_AFFILIATE_TAG = 'aventa_test';
    const items = buildModerationChecklist({
      title: 'A'.repeat(140),
      image_url: 'https://x/a.jpg',
      offer_url: 'https://articulo.mercadolibre.com.mx/MLM-1234567890-1?tag=aventa_test',
      category: 'hogar',
    });
    expect(items.find((i) => i.id === 'title')?.state).toBe('warn');
    expect(countChecklistBlockers(items)).toBe(0);
  });
});
