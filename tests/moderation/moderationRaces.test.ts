import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  batchFailureMessage,
  moderationDecisionApplied,
} from '@/lib/moderation/moderationDecisionResponse';
import { assertBulkMayActOnLock } from '@/lib/moderation/atomicModerationLock';

const ME = 'mod-me';
const OTHER = 'mod-other';
const fresh = () => new Date().toISOString();
const stale = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

describe('moderationDecisionApplied (reputación sin doble conteo)', () => {
  it('cuenta solo cuando esta llamada movió el estado', () => {
    expect(moderationDecisionApplied(true, { ok: true })).toBe(true);
  });

  it('no cuenta si ya estaba moderada (doble clic)', () => {
    expect(moderationDecisionApplied(true, { ok: true, idempotent: true })).toBe(false);
  });

  it('no cuenta en 409 (otro moderador ganó) ni en errores', () => {
    expect(moderationDecisionApplied(false, { error: 'La oferta ya fue moderada' })).toBe(false);
    expect(moderationDecisionApplied(false, null)).toBe(false);
    expect(moderationDecisionApplied(true, { ok: false })).toBe(false);
    expect(moderationDecisionApplied(true, null)).toBe(false);
  });
});

describe('batchFailureMessage', () => {
  it('null si todo se aplicó', () => {
    expect(batchFailureMessage([], 5)).toBeNull();
  });
  it('resume cuántas fallaron con el primer motivo legible', () => {
    expect(batchFailureMessage(['error', 'Esta oferta ya está siendo moderada por otro usuario.'], 4)).toBe(
      '2 de 4 no se aplicaron (Esta oferta ya está siendo moderada por otro usuario.).'
    );
    expect(batchFailureMessage(['error'], 1)).toBe('1 de 1 no se aplicaron.');
  });
});

describe('assertBulkMayActOnLock (lote no pisa a otro moderador)', () => {
  it('sin lock o lock propio → puede', () => {
    expect(assertBulkMayActOnLock({ locked_by: null, locked_at: null }, ME).ok).toBe(true);
    expect(assertBulkMayActOnLock({ locked_by: ME, locked_at: fresh() }, ME).ok).toBe(true);
  });
  it('lock ajeno activo → no puede', () => {
    const r = assertBulkMayActOnLock({ locked_by: OTHER, locked_at: fresh() }, ME);
    expect(r.ok).toBe(false);
  });
  it('lock ajeno vencido → puede', () => {
    expect(assertBulkMayActOnLock({ locked_by: OTHER, locked_at: stale() }, ME).ok).toBe(true);
  });
});

describe('contratos en rutas y panel', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('moderate-offer: aprobar y rechazar son condicionales a pending y el lote respeta locks', () => {
    const src = read('app/api/admin/moderate-offer/route.ts');
    expect(src).toMatch(/assertBulkMayActOnLock/);
    expect(src.match(/\.eq\('status', 'pending'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('update-offer: escritura compare-and-set por estado, 409 si cambió', () => {
    const src = read('app/api/admin/update-offer/route.ts');
    expect(src).toMatch(/\.eq\('status', offerStatus\)\.select\('id'\)/);
    expect(src).toMatch(/status_changed/);
  });

  it('panel: la reputación solo se incrementa si la decisión se aplicó', () => {
    const src = read('app/admin/moderation/panels/ModerationPendingPanel.tsx');
    const increments = src.match(/increment-(approved|rejected)/g) ?? [];
    expect(increments.length).toBe(4);
    expect(src.match(/moderationDecisionApplied\(/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(src).not.toMatch(/if \(offer\?\.created_by\) \{\s*await fetch\('\/api\/reputation/);
  });
});
