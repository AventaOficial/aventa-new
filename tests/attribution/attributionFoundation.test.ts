import { describe, expect, it, vi } from 'vitest';
import {
  buildClickIdempotencyKey,
  actorKeyFromSignals,
  buildAttributionIdentityChain,
} from '@/lib/attribution/clickIdentity';
import {
  resolveAttributionChannel,
  resolveCampaignKey,
  isAttributionChannel,
} from '@/lib/attribution/channels';
import { resolveServerAttributionContext } from '@/lib/attribution/resolveContext';
import { buildDestinationPair } from '@/lib/attribution/destination';
import { recordAttributedClick } from '@/lib/attribution/recordAttributedClick';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('attribution identity', () => {
  it('idempotency key es determinista en la misma ventana', () => {
    const a = buildClickIdempotencyKey({
      offerId: '11111111-1111-1111-1111-111111111111',
      actorKey: 'u:mod-a',
      nowMs: 1_000_000,
    });
    const b = buildClickIdempotencyKey({
      offerId: '11111111-1111-1111-1111-111111111111',
      actorKey: 'u:mod-a',
      nowMs: 1_000_000 + 60_000,
    });
    expect(a).toBe(b);
  });

  it('cambia de bucket fuera de ventana', () => {
    const a = buildClickIdempotencyKey({
      offerId: 'o1',
      actorKey: 'ip:abc',
      nowMs: 0,
      windowMs: 600_000,
    });
    const b = buildClickIdempotencyKey({
      offerId: 'o1',
      actorKey: 'ip:abc',
      nowMs: 600_000,
      windowMs: 600_000,
    });
    expect(a).not.toBe(b);
  });

  it('actorKey prefer userId sobre ip', () => {
    expect(actorKeyFromSignals({ userId: 'u1', ipHash: 'h' })).toBe('u:u1');
    expect(actorKeyFromSignals({ userId: null, ipHash: 'h' })).toBe('ip:h');
  });

  it('chain deja conversion/commission null', () => {
    const chain = buildAttributionIdentityChain({
      offerId: 'o1',
      clickId: 'c1',
      channel: 'organic',
    });
    expect(chain.conversionId).toBeNull();
    expect(chain.commissionId).toBeNull();
    expect(chain.trackingId).toBe('c1');
  });
});

describe('attribution channels', () => {
  it('mapea utm/referer allowlisted', () => {
    expect(resolveAttributionChannel({ utmSource: 'tiktok' })).toBe('tiktok');
    expect(resolveAttributionChannel({ referer: 'https://www.instagram.com/p/x' })).toBe(
      'instagram',
    );
    expect(resolveAttributionChannel({})).toBe('direct');
  });

  it('rechaza campaign malformada', () => {
    expect(resolveCampaignKey('ok-campaign_1')).toBe('ok-campaign_1');
    expect(resolveCampaignKey('DROP TABLE;')).toBeNull();
    expect(resolveCampaignKey('https://evil.com')).toBeNull();
  });

  it('taxonomía es extensible y tipada', () => {
    expect(isAttributionChannel('organic')).toBe(true);
    expect(isAttributionChannel('not-a-channel')).toBe(false);
  });
});

describe('server attribution context', () => {
  it('ignora channel basura del cliente', () => {
    const ctx = resolveServerAttributionContext({
      channel: 'hacker-channel',
      utmSource: 'seo',
    });
    expect(ctx.channel).toBe('seo');
  });

  it('acepta channel de taxonomía', () => {
    const ctx = resolveServerAttributionContext({ channel: 'telegram' });
    expect(ctx.channel).toBe('telegram');
  });
});

describe('destination separation', () => {
  it('separa original vs affiliate', () => {
    const pair = buildDestinationPair({
      offerUrl: 'https://www.amazon.com.mx/dp/B00?tag=aventa-20',
      originalOfferUrl: 'https://www.amazon.com.mx/dp/B00',
      detectNetwork: () => 'amazon',
    });
    expect(pair.affiliateDestination).toContain('tag=');
    expect(pair.originalDestination).not.toContain('tag=');
    expect(pair.merchantNetwork).toBe('amazon');
  });
});

describe('recordAttributedClick idempotency', () => {
  it('reusa click existente con misma idempotency key', async () => {
    const existingId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const inserts: unknown[] = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'offers') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    offer_url: 'https://www.amazon.com.mx/dp/B00TEST',
                    original_offer_url: 'https://www.amazon.com.mx/dp/B00TEST',
                    store: 'Amazon',
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        // reward_outbound_clicks
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  id: existingId,
                  offer_id: '11111111-1111-1111-1111-111111111111',
                  network: 'amazon',
                  product_fingerprint: 'amz:B00TEST',
                  destination_url: 'https://www.amazon.com.mx/dp/B00TEST',
                  original_destination_url: null,
                  channel: 'organic',
                  campaign_key: null,
                },
                error: null,
              })),
            })),
          })),
          insert: vi.fn(async (row: unknown) => {
            inserts.push(row);
            return { error: null };
          }),
        };
      }),
    };

    const first = await recordAttributedClick(supabase as never, {
      offerId: '11111111-1111-1111-1111-111111111111',
      clickerUserId: 'user-1',
      nowMs: 5_000_000,
    });
    expect(first?.reused).toBe(true);
    expect(first?.clickId).toBe(existingId);
    expect(inserts).toHaveLength(0);
  });

  it('falla cerrado sin offer_url DB', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: { offer_url: '', original_offer_url: null },
              error: null,
            })),
          })),
        })),
      })),
    };
    const r = await recordAttributedClick(supabase as never, {
      offerId: '11111111-1111-1111-1111-111111111111',
    });
    expect(r).toBeNull();
  });
});

describe('attribution migration + money safety', () => {
  it('migración es aditiva e idempotente', () => {
    const sql = readFileSync(
      join(process.cwd(), 'docs/supabase-migrations/20260916_attribution_foundation_clicks.sql'),
      'utf8',
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS channel/);
    expect(sql).toMatch(/idempotency_key/);
    expect(sql).toMatch(/original_destination_url/);
    expect(sql).not.toMatch(/creator_rewards/);
    expect(sql).not.toMatch(/DROP TABLE/);
  });

  it('track-outbound usa recordAttributedClick y OUTBOUND_EVENT_TYPE', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/track-outbound/route.ts'), 'utf8');
    expect(src).toMatch(/recordAttributedClick/);
    expect(src).toMatch(/OUTBOUND_EVENT_TYPE/);
    expect(src).toMatch(/conversionId: null/);
    expect(src).not.toMatch(/event_type:\s*'cazar_cta'/);
  });
});
