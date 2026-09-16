import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = 'docs/supabase-migrations/20260914_offer_events_cazar_cta_check.sql';

function src(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('offer_events cazar_cta contract', () => {
  it('migración amplía el CHECK para permitir cazar_cta sin quitar tipos existentes', () => {
    const sql = src(MIGRATION);
    expect(sql).toMatch(/offer_events_event_type_check/);
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS offer_events_event_type_check/);
    expect(sql).toMatch(/ADD CONSTRAINT offer_events_event_type_check/);
    expect(sql).toMatch(/'view'/);
    expect(sql).toMatch(/'outbound'/);
    expect(sql).toMatch(/'share'/);
    expect(sql).toMatch(/'cazar_cta'/);
    expect(sql).not.toMatch(/DROP TABLE\s+public\.offer_events/i);
    expect(sql).not.toMatch(/reward_outbound_clicks/i);
  });

  it('la app sigue aceptando cazar_cta en /api/events y writeQueue', () => {
    expect(src('app/api/events/route.ts')).toMatch(/cazar_cta/);
    expect(src('lib/server/writeQueue.ts')).toMatch(/cazar_cta/);
    // track-outbound usa constante canónica OUTBOUND_EVENT_TYPE (= 'outbound').
    const outbound = src('app/api/track-outbound/route.ts');
    expect(outbound).toMatch(/OUTBOUND_EVENT_TYPE|event_type:\s*'outbound'/);
    expect(outbound).not.toMatch(/cazar_cta/);
  });
});
