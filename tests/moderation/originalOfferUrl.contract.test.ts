import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('FocusOfferStage monetization UI contract', () => {
  it('13. vista principal no muestra tokens afiliados sensibles', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/components/moderation/FocusOfferStage.tsx'),
      'utf8'
    );
    expect(src).toMatch(/Monetización/);
    expect(src).toMatch(/computeMonetizationReadiness/);
    expect(src).not.toMatch(/matt_tool/);
    expect(src).not.toMatch(/matt_word/);
    expect(src).not.toMatch(/aff_fcid/);
    expect(src).not.toMatch(/AMAZON_ASSOCIATE/);
    // No renderiza offer_url en el JSX principal
    expect(src).not.toMatch(/\{offer\.offer_url\}/);
  });

  it('12. estados de monetización se exponen vía data attribute', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/components/moderation/FocusOfferStage.tsx'),
      'utf8'
    );
    expect(src).toMatch(/data-monetization-status/);
  });
});

describe('migración original_offer_url', () => {
  it('existe y no backfill falsifica originales', () => {
    const sql = readFileSync(
      join(process.cwd(), 'docs/supabase-migrations/20260907_offers_original_offer_url.sql'),
      'utf8'
    );
    expect(sql).toMatch(/original_offer_url/);
    expect(sql.toLowerCase()).not.toMatch(/update\s+public\.offers[\s\S]*set\s+original_offer_url\s*=\s*offer_url/);
  });
});
