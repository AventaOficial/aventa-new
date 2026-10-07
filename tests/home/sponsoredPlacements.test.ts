import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEED_POLICY,
  eligibleCampaigns,
  planFeedPlacements,
  sponsoredDisclosure,
  type SponsoredCampaign,
} from '@/lib/sponsored/placements';
import { SPONSORED_CAMPAIGNS } from '@/lib/sponsored/campaigns';

const NOW = Date.parse('2026-10-04T12:00:00Z');

function campaign(over: Partial<SponsoredCampaign> & { id: string }): SponsoredCampaign {
  return {
    kind: 'paid',
    store: 'Tienda',
    creative: { title: 't', cta: 'c' },
    surfaces: ['feed'],
    priority: 0,
    active: true,
    maxPerFeed: 1,
    ...over,
  };
}

const positions = (plan: Map<number, SponsoredCampaign>) => [...plan.entries()].map(([i, c]) => [i, c.id]);

describe('planFeedPlacements', () => {
  it('inserta el bloque propio cada 3 ofertas', () => {
    const plan = planFeedPlacements(20, SPONSORED_CAMPAIGNS, DEFAULT_FEED_POLICY, NOW);
    expect(positions(plan).map(([index]) => index)).toEqual([2, 5, 8, 11, 14, 17]);
    expect(new Set(positions(plan).map(([, id]) => id))).toEqual(new Set(['house-amazon-electronica']));
  });

  it('con campañas pagadas respeta la frecuencia de 3 y prioriza las pagadas', () => {
    const plan = planFeedPlacements(
      20,
      [campaign({ id: 'house', kind: 'house' }), campaign({ id: 'a', maxPerFeed: 2 }), campaign({ id: 'b', priority: 5 })],
      DEFAULT_FEED_POLICY,
      NOW,
    );
    expect(positions(plan)).toEqual([
      [2, 'b'],
      [5, 'a'],
      [8, 'house'],
      [11, 'a'],
    ]);
  });

  it('respeta maxSlots y no pone espacios más allá de las ofertas cargadas', () => {
    const many = Array.from({ length: 10 }, (_, i) => campaign({ id: `c${i}`, maxPerFeed: 5 }));
    expect(planFeedPlacements(100, many, { firstAfter: 2, every: 4, maxSlots: 3 }, NOW).size).toBe(3);
    expect(positions(planFeedPlacements(5, many, DEFAULT_FEED_POLICY, NOW)).map(([i]) => i)).toEqual([2]);
    expect(planFeedPlacements(1, many, DEFAULT_FEED_POLICY, NOW).size).toBe(0);
  });

  it('sin campañas elegibles no hay espacios', () => {
    expect(planFeedPlacements(20, [], DEFAULT_FEED_POLICY, NOW).size).toBe(0);
    expect(planFeedPlacements(20, [campaign({ id: 'x', active: false })], DEFAULT_FEED_POLICY, NOW).size).toBe(0);
  });
});

describe('eligibleCampaigns', () => {
  it('filtra por superficie, activación y ventana de fechas', () => {
    const list = [
      campaign({ id: 'rail', surfaces: ['rail'] }),
      campaign({ id: 'off', active: false }),
      campaign({ id: 'future', startsAt: '2026-11-01T00:00:00Z' }),
      campaign({ id: 'past', endsAt: '2026-10-01T00:00:00Z' }),
      campaign({ id: 'now', startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-31T00:00:00Z' }),
      campaign({ id: 'capped', maxPerFeed: 0 }),
    ];
    expect(eligibleCampaigns(list, 'feed', NOW).map((c) => c.id)).toEqual(['now']);
    expect(eligibleCampaigns(list, 'rail', NOW).map((c) => c.id)).toEqual(['rail']);
  });
});

describe('sponsoredDisclosure', () => {
  it('solo una campaña pagada se rotula como Patrocinado', () => {
    expect(sponsoredDisclosure('paid')).toBe('Patrocinado');
    expect(sponsoredDisclosure('house')).not.toMatch(/patrocin/i);
  });

  it('las campañas propias no prometen descuentos que nadie respalda', () => {
    for (const c of SPONSORED_CAMPAIGNS.filter((x) => x.kind === 'house')) {
      expect(c.creative.title, c.id).not.toMatch(/\d+\s*%/);
    }
  });
});

describe('Home usa la abstracción', () => {
  const page = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
  const slot = readFileSync(join(process.cwd(), 'app/components/HomeSponsored.tsx'), 'utf8');
  const tracking = readFileSync(join(process.cwd(), 'lib/sponsored/tracking.ts'), 'utf8');

  it('el feed no decide posiciones con índices fijos', () => {
    expect(page).toContain('planFeedPlacements(');
    expect(page).not.toMatch(/index === 1 && !debouncedQuery/);
    expect(page).not.toMatch(/index % \d/);
  });

  it('el slot mide impresión y clic sin escribir en base', () => {
    expect(slot).toContain("type: 'impression'");
    expect(slot).toContain("type: 'click'");
    expect(slot).toContain('sponsoredDisclosure(campaign.kind)');
    expect(slot).not.toMatch(/>\s*Patrocinado\s*</);
    expect(tracking).not.toMatch(/fetch\(|supabase/);
  });
});
