import { describe, expect, it } from 'vitest';
import { buildHumanVerdict } from '@/lib/moderation/humanVerdict';
import { FOCUS_REJECTION_PRESETS } from '@/lib/moderation/rejectionPresets';

describe('buildHumanVerdict', () => {
  it('oferta completa con buen score → good', () => {
    const v = buildHumanVerdict({
      price: 100,
      original_price: 200,
      image_url: 'https://x/y.jpg',
      category: 'tecnologia',
      risk_score: 10,
      is_bot: true,
      moderator_comment: '[bot-ingest v3] score=85 (moderación)',
    });
    expect(v.tone).toBe('good');
    expect(v.headline).toMatch(/buena oferta/i);
    expect(v.detail.toLowerCase()).not.toMatch(/score=\d/);
  });

  it('sin imagen → poor o caution, sin jerga de score en headline', () => {
    const v = buildHumanVerdict({
      price: 100,
      original_price: 200,
      image_url: null,
      category: 'tecnologia',
      risk_score: 10,
      is_bot: true,
      moderator_comment: '[bot-ingest v3] score=85 (moderación)',
    });
    expect(v.tone).toBe('poor');
    expect(v.detail.toLowerCase()).toMatch(/foto/);
  });

  it('lista artificial → caution con frase humana', () => {
    const v = buildHumanVerdict({
      price: 100,
      original_price: 300,
      image_url: 'https://x/y.jpg',
      category: 'tecnologia',
      risk_score: 5,
      is_bot: true,
      moderator_comment: '[bot-ingest v3] score=90 (moderación)',
      bot_meta: {
        signals: { suspectedArtificialListPrice: true, effectiveDiscountPercent: 3 },
      },
    });
    expect(v.tone).toBe('caution');
    expect(v.detail.toLowerCase()).toMatch(/habitual|anterior/);
  });

  it('gap card vs effective → caution', () => {
    const v = buildHumanVerdict({
      price: 3200,
      original_price: 10000,
      image_url: 'https://x/y.jpg',
      category: 'tecnologia',
      risk_score: 5,
      is_bot: true,
      moderator_comment: '[bot-ingest v3] score=80 (moderación)',
      bot_meta: {
        signals: { effectiveDiscountPercent: 5, suspectedArtificialListPrice: false },
      },
    });
    expect(v.tone).toBe('caution');
    expect(v.detail.toLowerCase()).toMatch(/etiqueta|ahorro/);
  });
});

describe('FOCUS_REJECTION_PRESETS', () => {
  it('incluye razones humanas claras sin typo', () => {
    const shorts = FOCUS_REJECTION_PRESETS.map((p) => p.short);
    expect(shorts).toContain('No es una buena oferta');
    expect(shorts).not.toContain('Buen oferta');
    expect(shorts.length).toBeLessThanOrEqual(8);
  });
});
