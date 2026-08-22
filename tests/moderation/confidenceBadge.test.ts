import { describe, it, expect } from 'vitest';
import {
  computeModerationTrust,
  isLowModerationTrust,
  parseBotIngestScore,
} from '@/lib/moderation/confidenceBadge';

describe('parseBotIngestScore', () => {
  it('extrae score del comentario bot-ingest', () => {
    expect(parseBotIngestScore('[bot-ingest v3] score=82 (moderación)')).toBe(82);
  });
});

describe('computeModerationTrust', () => {
  it('confianza baja por risk alto', () => {
    const r = computeModerationTrust({
      risk_score: 72,
      image_url: 'https://x.com/a.jpg',
      category: 'tecnologia',
    });
    expect(r.level).toBe('low');
    expect(r.label).toBe('Confianza baja');
  });

  it('confianza baja por score bot bajo', () => {
    const r = computeModerationTrust({
      risk_score: 10,
      moderator_comment: '[bot-ingest v3] score=45 (moderación)',
      image_url: 'https://x.com/a.jpg',
      category: 'tecnologia',
      is_bot: true,
    });
    expect(r.level).toBe('low');
  });

  it('confianza alta para bot con buen score y datos completos', () => {
    const r = computeModerationTrust({
      risk_score: 12,
      moderator_comment: '[bot-ingest v3] score=85 (moderación)',
      image_url: 'https://x.com/a.jpg',
      category: 'tecnologia',
      is_bot: true,
    });
    expect(r.level).toBe('high');
  });

  it('monitor no hereda smart-tv: confianza media por score bot medio', () => {
    const r = computeModerationTrust({
      risk_score: 30,
      moderator_comment: '[bot-ingest v3] score=65 (moderación)',
      image_url: 'https://x.com/a.jpg',
      category: 'tecnologia',
      is_bot: true,
    });
    expect(r.level).toBe('medium');
  });

  it('isLowModerationTrust alinea con filtro de cola', () => {
    expect(isLowModerationTrust({ risk_score: 55, image_url: 'x', category: 'moda' })).toBe(true);
    expect(isLowModerationTrust({ risk_score: 10, image_url: 'x', category: 'moda' })).toBe(false);
  });
});
