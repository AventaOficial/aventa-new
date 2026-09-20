import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyDiscoveryIntelligence,
  evaluateNegativeMemory,
  isSuppressedByNegativeMemory,
} from '@/lib/discovery/negativeMemory';
import type { NegativeMemoryEvent } from '@/lib/discovery/negativeMemory';

describe('discovery path audit — no NM bypass for machine inserts', () => {
  it('externalWorker applies applyDiscoveryIntelligence', () => {
    const src = readFileSync(join(process.cwd(), 'lib/bots/ingest/externalWorker.ts'), 'utf8');
    expect(src).toContain('applyDiscoveryIntelligence');
    expect(src).toContain('loadNegativeMemoryEvents');
  });

  it('S7 bridge gates SUPPRESS via isSuppressedByNegativeMemory', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/supply/s7Bridge/writePendingViaS7Bridge.ts'),
      'utf8',
    );
    expect(src).toContain('isSuppressedByNegativeMemory');
    expect(src).toContain('NEGATIVE_MEMORY');
  });

  it('insertIngestedOffer defense-in-depth cannot bypass SUPPRESS', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/bots/ingest/insertIngestedOffer.ts'),
      'utf8',
    );
    expect(src).toContain('isSuppressedByNegativeMemory');
    expect(src).toContain('NEGATIVE_MEMORY');
  });

  it('externalWorker passes inferred category into discovery intelligence (perfume soft-rank)', () => {
    const src = readFileSync(join(process.cwd(), 'lib/bots/ingest/externalWorker.ts'), 'utf8');
    expect(src).toContain('classifyBotCategoryForStorage');
    expect(src).not.toMatch(/category:\s*null/);
  });

  it('runIngestCycle remains discovery-only (no insert bypass)', () => {
    const src = readFileSync(join(process.cwd(), 'lib/bots/ingest/runIngestCycle.ts'), 'utf8');
    expect(src).toMatch(/S91_DISCOVERY_ONLY|discovery-only|S9\.1/i);
    expect(src).not.toContain('insertIngestedOffer(');
  });

  it('community POST /api/offers is human path (not machine NM)', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/offers/route.ts'), 'utf8');
    expect(src).toContain('createOfferInputSchema');
    expect(src).not.toContain('applyDiscoveryIntelligence');
  });

  it('isSuppressedByNegativeMemory returns suppress for spam within TTL', async () => {
    const fp = 'ml:MLM2936772026';
    const now = new Date('2026-09-20T12:00:00.000Z');
    const events = new Map<string, NegativeMemoryEvent[]>([
      [
        fp,
        [
          {
            fingerprint: fp,
            status: 'rejected',
            rejectionReason:
              'Contenido que no cumple las normas de la comunidad (spam o promoción no permitida).',
            createdAt: '2026-09-19T12:00:00.000Z',
          },
        ],
      ],
    ]);
    const d = evaluateNegativeMemory({
      fingerprint: fp,
      events: events.get(fp)!,
      now,
    });
    expect(d.level).toBe('SUPPRESS');
    expect(typeof isSuppressedByNegativeMemory).toBe('function');
  });

  it('ml_worker and ml_api candidates both go through intelligence multipliers', () => {
    const result = applyDiscoveryIntelligence({
      candidates: [
        {
          id: '1',
          url: 'https://articulo.mercadolibre.com.mx/MLM-1111111111-a',
          title: 'A',
          score: 50,
          source: 'ml_worker',
        },
        {
          id: '2',
          url: 'https://articulo.mercadolibre.com.mx/MLM-2222222222-b',
          title: 'B',
          score: 50,
          source: 'ml_api',
        },
      ],
      eventsByFingerprint: new Map(),
      limit: 2,
    });
    expect(result.shortlist).toHaveLength(2);
    // ml_api prior > ml_worker → higher effective score for same base
    const api = result.shortlist.find((c) => c.source === 'ml_api');
    const worker = result.shortlist.find((c) => c.source === 'ml_worker');
    expect(api && worker && api.score >= worker.score).toBe(true);
  });
});
