import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  OFFER_COMMENT_DB_MAX_CHARS,
  OFFER_COMMENT_MAX_CHARS,
  OFFER_COMMENT_TARGET_MAX_CHARS,
  assessOfferCommentText,
} from '@/lib/contracts/offerComments';

describe('contrato de comentarios de oferta', () => {
  it('el límite activo nunca supera lo que admite la BD', () => {
    expect(OFFER_COMMENT_MAX_CHARS).toBeLessThanOrEqual(OFFER_COMMENT_DB_MAX_CHARS);
    expect(OFFER_COMMENT_TARGET_MAX_CHARS).toBe(500);
  });

  it('con el esquema actual (280): acepta 280, rechaza 281', () => {
    expect(OFFER_COMMENT_DB_MAX_CHARS).toBe(280);
    expect(assessOfferCommentText('a'.repeat(280)).ok).toBe(true);
    expect(assessOfferCommentText('a'.repeat(281)).ok).toBe(false);
  });

  it('con el límite objetivo (500): acepta 280, 281 y 500; rechaza 501', () => {
    const max = OFFER_COMMENT_TARGET_MAX_CHARS;
    expect(assessOfferCommentText('a'.repeat(280), max).ok).toBe(true);
    expect(assessOfferCommentText('a'.repeat(281), max).ok).toBe(true);
    expect(assessOfferCommentText('a'.repeat(500), max).ok).toBe(true);
    const over = assessOfferCommentText('a'.repeat(501), max);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.message).toContain('500');
  });

  it('rechaza vacío y recorta espacios', () => {
    expect(assessOfferCommentText('   ').ok).toBe(false);
    const r = assessOfferCommentText('  hola  ');
    expect(r.ok && r.text).toBe('hola');
  });

  it('la API POST usa el contrato compartido sin límites hardcodeados', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/offers/[offerId]/comments/route.ts'),
      'utf8',
    );
    expect(route).toContain('assessOfferCommentText');
    expect(route).toContain('moderateCommentText');
    expect(route).toContain('evaluateAbusePolicy');
    expect(route).not.toMatch(/length > 280/);
  });

  it('formularios usan el límite compartido', () => {
    for (const file of ['app/components/OfferModal.tsx', 'app/oferta/[id]/OfferPageContent.tsx']) {
      const src = readFileSync(join(process.cwd(), file), 'utf8');
      expect(src).toContain('maxLength={OFFER_COMMENT_MAX_CHARS}');
      expect(src).not.toMatch(/máx\. 280/);
    }
  });

  it('la migración preparada amplía a varchar(500)', () => {
    const mig = readFileSync(
      join(process.cwd(), 'docs/supabase-migrations/20261011_comments_content_500.sql'),
      'utf8',
    );
    expect(mig).toMatch(/ALTER TABLE public\.comments\s+ALTER COLUMN content TYPE varchar\(500\)/);
  });
});
