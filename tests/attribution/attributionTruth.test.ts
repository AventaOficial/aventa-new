import { describe, expect, it } from 'vitest';
import {
  aggregateAttributionWindow,
  isPersistedClickAttributionComplete,
  buildAttributionTruth,
  type AttributionClickRow,
} from '@/lib/attribution/buildAttributionTruth';
import { OUTBOUND_ATTRIBUTION_SOT, OUTBOUND_VOLUME_SOT } from '@/lib/analytics/outboundClickContract';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('isPersistedClickAttributionComplete', () => {
  it('exige offer + channel allowlisted + destination', () => {
    expect(
      isPersistedClickAttributionComplete({
        offer_id: 'o1',
        channel: 'tiktok',
        destination_url: 'https://x',
      }),
    ).toBe(true);
  });

  it('falla sin destination / channel unknown / sin offer', () => {
    expect(
      isPersistedClickAttributionComplete({
        offer_id: 'o1',
        channel: 'tiktok',
        destination_url: '',
      }),
    ).toBe(false);
    expect(
      isPersistedClickAttributionComplete({
        offer_id: 'o1',
        channel: 'unknown',
        destination_url: 'https://x',
      }),
    ).toBe(false);
    expect(
      isPersistedClickAttributionComplete({
        offer_id: '',
        channel: 'organic',
        destination_url: 'https://x',
      }),
    ).toBe(false);
    expect(
      isPersistedClickAttributionComplete({
        offer_id: 'o1',
        channel: 'hacker',
        destination_url: 'https://x',
      }),
    ).toBe(false);
  });

  it('campaign no es requerida para complete', () => {
    expect(
      isPersistedClickAttributionComplete({
        offer_id: 'o1',
        channel: 'direct',
        campaign_key: null,
        destination_url: 'https://x',
      }),
    ).toBe(true);
  });
});

describe('aggregateAttributionWindow', () => {
  const rows: AttributionClickRow[] = [
    {
      id: 'c1',
      offer_id: 'o1',
      network: 'amazon',
      channel: 'tiktok',
      campaign_key: 'camp_a',
      destination_url: 'https://a',
      original_destination_url: 'https://a0',
      created_at: '2026-09-16T12:00:00.000Z',
    },
    {
      id: 'c2',
      offer_id: 'o1',
      network: 'amazon',
      channel: 'unknown',
      campaign_key: null,
      destination_url: 'https://b',
      original_destination_url: null,
      created_at: '2026-09-16T13:00:00.000Z',
    },
    {
      id: 'c3',
      offer_id: 'o2',
      network: 'mercadolibre',
      channel: 'organic',
      campaign_key: 'camp_a',
      destination_url: null,
      original_destination_url: null,
      created_at: '2026-09-16T14:00:00.000Z',
    },
  ];

  it('calcula gap = clicks - complete sin inferir money', () => {
    const w = aggregateAttributionWindow({
      label: 'h24',
      sinceIso: '2026-09-15T00:00:00.000Z',
      rows,
      outboundVolume: 99,
    });
    expect(w.persistedClicks).toBe(3);
    expect(w.uniqueClickIds).toBe(3);
    expect(w.attributionComplete).toBe(1); // solo c1
    expect(w.attributionGap).toBe(2);
    expect(w.outboundVolume).toBe(99);
    expect(w.byChannel[0]?.channel).toBeTruthy();
    expect(w.topOffers.find((o) => o.offerId === 'o1')?.clicks).toBe(2);
    expect(w.withCampaign).toBe(2);
    expect(w.missingDestination).toBe(1);
  });

  it('dataset vacío → gap 0 y completeness null', () => {
    const w = aggregateAttributionWindow({
      label: 'today',
      sinceIso: 'x',
      rows: [],
      outboundVolume: 0,
    });
    expect(w.persistedClicks).toBe(0);
    expect(w.attributionGap).toBe(0);
    expect(w.completenessPct).toBeNull();
  });
});

describe('buildAttributionTruth money + SoT boundaries', () => {
  it('nunca conecta conversion/commission/revenue', async () => {
    const now = new Date('2026-09-16T18:00:00.000Z');
    const supabase = {
      from: (table: string) => {
        if (table === 'offer_events') {
          return {
            select: () => ({
              eq: () => ({
                gte: async () => ({ count: 5, error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            gte: () => ({
              order: () => ({
                limit: async () => ({
                  data: [
                    {
                      id: 'c1',
                      offer_id: 'o1',
                      network: 'amazon',
                      channel: 'seo',
                      campaign_key: null,
                      destination_url: 'https://x',
                      original_destination_url: 'https://y',
                      created_at: '2026-09-16T17:00:00.000Z',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      },
    };

    const snap = await buildAttributionTruth(supabase as never, { now });
    expect(snap.attributionSot).toBe(OUTBOUND_ATTRIBUTION_SOT);
    expect(snap.volumeSot).toBe(OUTBOUND_VOLUME_SOT);
    expect(snap.conversions).toBeNull();
    expect(snap.confirmedRevenueCents).toBeNull();
    expect(snap.conversion).toEqual({
      connected: false,
      count: null,
      label: 'not connected',
    });
    expect(snap.commission.label).toBe('not connected');
    expect(snap.attributedClicks).toBe(1);
    expect(snap.attributionGap).toBe(0);
    expect(snap.outboundVolume).toBe(5);
    // volume ≠ clicks
    expect(snap.outboundVolume).not.toBe(snap.attributedClicks);
  });

  it('CEO panel no muestra $0 revenue fingido', () => {
    const ceo = readFileSync(
      join(process.cwd(), 'app/admin/owner/components/CeoControlCenter.tsx'),
      'utf8',
    );
    expect(ceo).toMatch(/Attribution gap/);
    expect(ceo).toMatch(/not connected/);
    expect(ceo).toMatch(/offer_events ≠ clicks/);
    expect(ceo).not.toMatch(/\$0 revenue/i);
  });
});
