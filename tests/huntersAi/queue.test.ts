import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { editorialStatus } from '@/lib/huntersAi/contract';
import { dedupeSources, readPriceHistory, sortCards, toHunterCard, type HunterSource } from '@/lib/huntersAi/present';

function source(over: Partial<HunterSource> = {}): HunterSource {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    batchId: '22222222-2222-4222-8222-222222222222',
    status: 'READY',
    identityKey: 'amz:B0TEST',
    sourceUrl: 'https://www.amazon.com.mx/dp/B0TEST',
    canonicalUrl: 'https://www.amazon.com.mx/dp/B0TEST',
    retailer: 'amazon',
    store: 'Amazon',
    title: 'Papel higiénico 24 rollos',
    hintTitle: null,
    price: 189,
    hintPrice: null,
    originalPrice: 249,
    hintOriginalPrice: null,
    discountPercent: 24,
    category: 'Hogar',
    hintNote: 'Nota del hunter',
    duplicateStatus: 'none',
    duplicateOfferId: null,
    offerId: null,
    rejectionReason: null,
    evidence: {},
    createdAt: '2026-10-05T12:00:00.000Z',
    approvedAt: null,
    rejectedAt: null,
    mcpRunId: 'aventa-hunter-2026-10-05-05',
    hunterName: 'Aventa Daily Hunter',
    ...over,
  };
}

describe('Hunters IA · presentación', () => {
  it('mapea el pipeline a la cola editorial sin inventar historial ni score', () => {
    expect(editorialStatus('READY', {})).toBe('PENDING');
    expect(editorialStatus('NEEDS_REVIEW', {})).toBe('NEEDS_REVIEW');
    expect(editorialStatus('APPROVED', {})).toBe('APPROVED');
    expect(editorialStatus('REJECTED', {})).toBe('REJECTED');
    const card = toHunterCard(source());
    expect(card.history).toEqual({ available: false, label: 'Historial insuficiente' });
    expect(card.dealScore).toBeNull();
    expect(card.dailyNeed).toBe(true);
    expect(card.absoluteSavings).toBe(60);
    expect(card.runId).toBe('aventa-hunter-2026-10-05-05');
  });

  it('solo muestra historial cuando la evidencia lo trae explícito', () => {
    const missing = readPriceHistory({ price_history: { estimated: true, min: 10 } }, 189, 249);
    expect(missing.available).toBe(false);
    const real = readPriceHistory({ price_history: { habitualMin: 239, habitualMax: 259, days: 90, grade: 'A' } }, 189, 249);
    expect(real.available).toBe(true);
    if (real.available) {
      expect(real.habitualMin).toBe(239);
      expect(real.grade).toBe('A');
      expect(real.reading).toBe('Está por debajo de su rango habitual.');
    }
  });

  it('deduplica por identidad y deja el más reciente', () => {
    const rows = dedupeSources([
      source({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', createdAt: '2026-10-05T10:00:00.000Z' }),
      source({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', createdAt: '2026-10-05T11:00:00.000Z' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  });

  it('ordena pendientes por deal score y deja sin score al final', () => {
    const cards = [
      toHunterCard(source({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', evidence: {} })),
      toHunterCard(source({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', identityKey: 'other', evidence: { deal_score: 91 } })),
    ];
    expect(sortCards(cards, 'score').map((c) => c.dealScore)).toEqual([91, null]);
  });
});

describe('Hunters IA · fronteras', () => {
  const root = process.cwd();
  const read = (path: string) => readFileSync(join(root, path), 'utf8');

  it('la API exige moderación y no abre economía ni MCP', () => {
    const route = read('app/api/admin/hunters-ai/route.ts');
    expect(route).toContain('requireBatchAuth');
    expect(route).not.toMatch(/rewards|ledger|commission|payout|reputation|achievement/i);
    const decide = read('lib/huntersAi/decide.ts');
    expect(decide).toContain('approveOfferBatchItem');
    expect(decide).not.toMatch(/@\/lib\/(rewards|economy|server\/commission|server\/reputation|achievements)/);
    expect(read('app/api/mcp/route.ts')).not.toContain('hunters-ai');
  });

  it('aprobar un duplicado no crea otra oferta', () => {
    const decide = read('lib/huntersAi/decide.ts');
    const fn = decide.slice(decide.indexOf('export async function approveHunterCandidate'));
    expect(fn.indexOf('DUPLICATE_OFFER')).toBeGreaterThan(-1);
    expect(fn.indexOf('DUPLICATE_OFFER')).toBeLessThan(fn.indexOf('approveOfferBatchItem('));
  });
});
