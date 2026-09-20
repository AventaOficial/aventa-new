import { describe, expect, it } from 'vitest';
import {
  evaluateNegativeMemory,
  classifyRejectionSignal,
  applyDiscoveryIntelligence,
  NEGATIVE_MEMORY_TTL_MS,
  type NegativeMemoryEvent,
} from '@/lib/discovery/negativeMemory';
import { AUTO_REJECTED_TIMEOUT_REASON } from '@/lib/offers/findDuplicateOffer';
import { scoreCategoryPolicy, PERFUME_DISCOVERY_POLICY } from '@/lib/discovery/categoryPolicies';
import { selectDiverseShortlist, sourceQualityMultiplier } from '@/lib/discovery/diversity';
import { FOCUS_REJECTION_PRESETS } from '@/lib/moderation/rejectionPresets';

const SPAM =
  FOCUS_REJECTION_PRESETS.find((p) => p.short === 'Spam')?.full ??
  'Contenido que no cumple las normas de la comunidad (spam o promoción no permitida).';

function ev(
  partial: Partial<NegativeMemoryEvent> & Pick<NegativeMemoryEvent, 'createdAt' | 'status'>,
): NegativeMemoryEvent {
  return {
    fingerprint: 'ml:MLM111',
    rejectionReason: null,
    ...partial,
  };
}

describe('negative memory 72h', () => {
  const now = new Date('2026-09-20T12:00:00.000Z');

  it('ALLOW en primera aparición', () => {
    const d = evaluateNegativeMemory({
      fingerprint: 'ml:MLM111',
      events: [],
      now,
    });
    expect(d.level).toBe('ALLOW');
  });

  it('un solo reject genérico → PENALIZE, no SUPPRESS permanente', () => {
    const d = evaluateNegativeMemory({
      fingerprint: 'ml:MLM111',
      events: [
        ev({
          status: 'rejected',
          rejectionReason: 'No es una buena oferta para publicar en Aventa.',
          createdAt: '2026-09-20T10:00:00.000Z',
        }),
      ],
      now,
    });
    expect(d.level).toBe('PENALIZE');
    expect(d.rejectCount).toBe(1);
  });

  it('spam dentro de 72h → SUPPRESS', () => {
    const d = evaluateNegativeMemory({
      fingerprint: 'ml:MLM111',
      events: [
        ev({
          status: 'rejected',
          rejectionReason: SPAM,
          createdAt: '2026-09-19T12:00:00.000Z',
        }),
      ],
      now,
      ttlMs: NEGATIVE_MEMORY_TTL_MS,
    });
    expect(d.level).toBe('SUPPRESS');
    expect(d.spamCount).toBe(1);
  });

  it('≥2 rejects dentro de 72h → SUPPRESS', () => {
    const d = evaluateNegativeMemory({
      fingerprint: 'ml:MLM111',
      events: [
        ev({
          status: 'rejected',
          rejectionReason: 'No es una buena oferta para publicar en Aventa.',
          createdAt: '2026-09-18T20:00:00.000Z',
        }),
        ev({
          status: 'rejected',
          rejectionReason: 'No es una buena oferta para publicar en Aventa.',
          createdAt: '2026-09-19T20:00:00.000Z',
        }),
      ],
      now,
    });
    expect(d.level).toBe('SUPPRESS');
    expect(d.rejectCount).toBe(2);
  });

  it('auto_rejected_timeout ≠ spam', () => {
    expect(
      classifyRejectionSignal({
        status: 'rejected',
        rejectionReason: AUTO_REJECTED_TIMEOUT_REASON,
      }),
    ).toBe('auto_rejected_timeout');

    const d = evaluateNegativeMemory({
      fingerprint: 'ml:MLM111',
      events: [
        ev({
          status: 'rejected',
          rejectionReason: AUTO_REJECTED_TIMEOUT_REASON,
          createdAt: '2026-09-19T12:00:00.000Z',
        }),
      ],
      now,
    });
    expect(d.level).toBe('PENALIZE');
    expect(d.spamCount).toBe(0);
  });

  it('repeat penalty baja score sin eliminar', () => {
    const events = new Map<string, NegativeMemoryEvent[]>([
      [
        'ml:MLM9999999999',
        [
          ev({
            fingerprint: 'ml:MLM9999999999',
            status: 'rejected',
            rejectionReason: 'No es una buena oferta para publicar en Aventa.',
            createdAt: '2026-09-10T12:00:00.000Z',
          }),
        ],
      ],
    ]);
    const result = applyDiscoveryIntelligence({
      candidates: [
        {
          id: 'a',
          url: 'https://articulo.mercadolibre.com.mx/MLM-9999999999-x',
          title: 'Producto A',
          score: 100,
          source: 'ml_api',
        },
        {
          id: 'b',
          url: 'https://articulo.mercadolibre.com.mx/MLM-8888888888-y',
          title: 'Producto B nuevo',
          score: 90,
          source: 'ml_api',
        },
      ],
      eventsByFingerprint: events,
      limit: 2,
      now,
    });
    expect(result.suppressed).toHaveLength(0);
    expect(result.penalized.length).toBeGreaterThanOrEqual(1);
    expect(result.shortlist[0].id).toBe('b');
  });

  it('source quality: ml_api > ml_worker', () => {
    expect(sourceQualityMultiplier('ml_api')).toBeGreaterThan(
      sourceQualityMultiplier('ml_worker'),
    );
  });

  it('category diversity evita monopolio de una familia', () => {
    const picked = selectDiverseShortlist(
      [
        { id: '1', score: 100, title: 'Audífonos A' },
        { id: '2', score: 99, title: 'Audífonos B' },
        { id: '3', score: 98, title: 'Audífonos C' },
        { id: '4', score: 97, title: 'Audífonos D' },
        { id: '5', score: 96, title: 'Freidora de aire' },
        { id: '6', score: 95, title: 'Smartwatch X' },
      ],
      4,
      { maxPerCategory: 2 },
    );
    const audio = picked.filter((c) => /aud/i.test(c.title ?? '')).length;
    expect(audio).toBeLessThanOrEqual(2);
    expect(picked.some((c) => /freidora|smartwatch/i.test(c.title ?? ''))).toBe(true);
  });
});

describe('perfume discovery policy', () => {
  it('Lattafa + descuento fuerte → boost', () => {
    const s = scoreCategoryPolicy({
      title: 'Lattafa Asad Eau de Parfum 100ml',
      category: 'belleza',
      discountPercent: 40,
      price: 599,
    });
    expect(s.policyId).toBe(PERFUME_DISCOVERY_POLICY.id);
    expect(s.matchedBrand).toBe('lattafa');
    expect(s.multiplier).toBeGreaterThan(1.1);
  });

  it('Lattafa + descuento mediocre → sin boost fuerte', () => {
    const s = scoreCategoryPolicy({
      title: 'Lattafa Yara',
      category: 'belleza',
      discountPercent: 5,
      price: 800,
    });
    expect(s.matchedBrand).toBe('lattafa');
    expect(s.multiplier).toBeLessThanOrEqual(1.05);
  });
});
