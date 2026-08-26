import { describe, expect, it } from 'vitest';
import { moderateCommentText } from '@/lib/moderation/commentProfanity';

describe('moderateCommentText', () => {
  it('permite comentarios limpios', () => {
    expect(moderateCommentText('Buena oferta, gracias por compartir').verdict).toBe('allow');
  });

  it('bloquea insultos graves', () => {
    const r = moderateCommentText('Qué pendejo el que subió esto');
    expect(r.verdict).toBe('block');
  });

  it('retiene acusaciones de estafa', () => {
    const r = moderateCommentText('Esto es una estafa total');
    expect(r.verdict).toBe('hold');
  });

  it('retiene spam de enlaces', () => {
    const r = moderateCommentText('Mira https://a.com https://b.com https://c.com');
    expect(r.verdict).toBe('hold');
  });

  it('retiene texto repetitivo', () => {
    const r = moderateCommentText('aaaaaaaaaaaaaaaa');
    expect(r.verdict).toBe('hold');
  });
});
