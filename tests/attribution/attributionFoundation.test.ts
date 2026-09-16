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

describe('recordAttributedClick idempotency + reuse SoT', () => {
  const OFFER_ID = '11111111-1111-1111-1111-111111111111';
  const EXISTING_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const OFFER_URL = 'https://www.amazon.com.mx/dp/B00TEST?tag=aventa-20';
  const ORIGINAL_URL = 'https://www.amazon.com.mx/dp/B00TEST';
  const NOW = 5_000_000;

  type PersistedClick = {
    id: string;
    offer_id: string;
    network: string;
    product_fingerprint: string | null;
    destination_url: string | null;
    original_destination_url: string | null;
    channel: string | null;
    campaign_key: string | null;
  };

  function mockSupabase(opts: {
    existing?: PersistedClick | null;
    /** Simula carrera: primer select vacío, insert UNIQUE, segundo select con fila. */
    raceExisting?: PersistedClick;
  }) {
    const inserts: unknown[] = [];
    let selectCount = 0;
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'offers') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    offer_url: OFFER_URL,
                    original_offer_url: ORIGINAL_URL,
                    store: 'Amazon',
                  },
                  error: null,
                })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                selectCount += 1;
                if (opts.raceExisting) {
                  if (selectCount === 1) {
                    return { data: null, error: null };
                  }
                  return { data: opts.raceExisting, error: null };
                }
                return {
                  data: opts.existing ?? null,
                  error: null,
                };
              }),
            })),
          })),
          insert: vi.fn(async (row: unknown) => {
            inserts.push(row);
            if (opts.raceExisting) {
              return { error: { code: '23505', message: 'duplicate key value' } };
            }
            return { error: null };
          }),
        };
      }),
    };
    return { supabase, inserts, getSelectCount: () => selectCount };
  }

  it('NEW: persiste y devuelve attribution del request allowlisted', async () => {
    const { supabase, inserts } = mockSupabase({ existing: null });
    const r = await recordAttributedClick(supabase as never, {
      offerId: OFFER_ID,
      clickerUserId: 'user-1',
      nowMs: NOW,
      hints: { channel: 'tiktok', campaign: 'spring_push' },
    });
    expect(r?.reused).toBe(false);
    expect(r?.channel).toBe('tiktok');
    expect(r?.campaignKey).toBe('spring_push');
    expect(r?.destinationUrl).toContain('tag=');
    expect(r?.originalDestinationUrl).toBe(ORIGINAL_URL);
    expect(inserts).toHaveLength(1);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.channel).toBe('tiktok');
    expect(row.campaign_key).toBe('spring_push');
    expect(row.destination_url).toBe(r?.destinationUrl);
  });

  it('REUSED same request: same click_id, no insert', async () => {
    const existing: PersistedClick = {
      id: EXISTING_ID,
      offer_id: OFFER_ID,
      network: 'amazon',
      product_fingerprint: 'amz:B00TEST',
      destination_url: OFFER_URL,
      original_destination_url: ORIGINAL_URL,
      channel: 'organic',
      campaign_key: 'camp_a',
    };
    const { supabase, inserts } = mockSupabase({ existing });
    const r = await recordAttributedClick(supabase as never, {
      offerId: OFFER_ID,
      clickerUserId: 'user-1',
      nowMs: NOW,
      hints: { channel: 'organic', campaign: 'camp_a' },
    });
    expect(r?.reused).toBe(true);
    expect(r?.clickId).toBe(EXISTING_ID);
    expect(r?.channel).toBe('organic');
    expect(r?.campaignKey).toBe('camp_a');
    expect(inserts).toHaveLength(0);
  });

  it('REUSED different channel: request no puede sobrescribir', async () => {
    const existing: PersistedClick = {
      id: EXISTING_ID,
      offer_id: OFFER_ID,
      network: 'amazon',
      product_fingerprint: 'amz:B00TEST',
      destination_url: OFFER_URL,
      original_destination_url: ORIGINAL_URL,
      channel: 'organic',
      campaign_key: 'camp_a',
    };
    const { supabase, inserts } = mockSupabase({ existing });
    const r = await recordAttributedClick(supabase as never, {
      offerId: OFFER_ID,
      clickerUserId: 'user-1',
      nowMs: NOW,
      hints: { channel: 'tiktok', campaign: 'camp_a' },
    });
    expect(r?.reused).toBe(true);
    expect(r?.channel).toBe('organic');
    expect(r?.campaignKey).toBe('camp_a');
    expect(inserts).toHaveLength(0);
  });

  it('REUSED different campaign: request no puede sobrescribir', async () => {
    const existing: PersistedClick = {
      id: EXISTING_ID,
      offer_id: OFFER_ID,
      network: 'amazon',
      product_fingerprint: 'amz:B00TEST',
      destination_url: OFFER_URL,
      original_destination_url: ORIGINAL_URL,
      channel: 'seo',
      campaign_key: 'camp_x',
    };
    const { supabase } = mockSupabase({ existing });
    const r = await recordAttributedClick(supabase as never, {
      offerId: OFFER_ID,
      clickerUserId: 'user-1',
      nowMs: NOW,
      hints: { channel: 'seo', campaign: 'camp_y_poison' },
    });
    expect(r?.reused).toBe(true);
    expect(r?.campaignKey).toBe('camp_x');
    expect(r?.channel).toBe('seo');
  });

  it('REUSED different destination hint: destination SoT = fila persistida', async () => {
    const persistedDest = 'https://www.amazon.com.mx/dp/B00CANON?tag=aventa-20';
    const existing: PersistedClick = {
      id: EXISTING_ID,
      offer_id: OFFER_ID,
      network: 'amazon',
      product_fingerprint: 'amz:B00CANON',
      destination_url: persistedDest,
      original_destination_url: 'https://www.amazon.com.mx/dp/B00CANON',
      channel: 'direct',
      campaign_key: null,
    };
    const { supabase } = mockSupabase({ existing });
    const r = await recordAttributedClick(supabase as never, {
      offerId: OFFER_ID,
      clickerUserId: 'user-1',
      nowMs: NOW,
      hints: { channel: 'paid' },
    });
    expect(r?.reused).toBe(true);
    expect(r?.destinationUrl).toBe(persistedDest);
    expect(r?.originalDestinationUrl).toBe('https://www.amazon.com.mx/dp/B00CANON');
    expect(r?.channel).toBe('direct');
    // No mezclar offer URL actual como destination del click reused.
    expect(r?.destinationUrl).not.toBe(OFFER_URL);
  });

  it('NO duplicate row / NO double metric: segunda llamada no inserta', async () => {
    const existing: PersistedClick = {
      id: EXISTING_ID,
      offer_id: OFFER_ID,
      network: 'amazon',
      product_fingerprint: 'amz:B00TEST',
      destination_url: OFFER_URL,
      original_destination_url: ORIGINAL_URL,
      channel: 'telegram',
      campaign_key: 'tg1',
    };
    const { supabase, inserts } = mockSupabase({ existing });
    const a = await recordAttributedClick(supabase as never, {
      offerId: OFFER_ID,
      clickerUserId: 'user-1',
      nowMs: NOW,
    });
    const b = await recordAttributedClick(supabase as never, {
      offerId: OFFER_ID,
      clickerUserId: 'user-1',
      nowMs: NOW,
      hints: { channel: 'discord', campaign: 'other' },
    });
    expect(a?.clickId).toBe(b?.clickId);
    expect(a?.reused).toBe(true);
    expect(b?.reused).toBe(true);
    expect(b?.channel).toBe('telegram');
    expect(b?.campaignKey).toBe('tg1');
    expect(inserts).toHaveLength(0);
  });

  it('CONCURRENT: UNIQUE collision → releer canónico, un solo insert intentado', async () => {
    const winner: PersistedClick = {
      id: EXISTING_ID,
      offer_id: OFFER_ID,
      network: 'amazon',
      product_fingerprint: 'amz:B00TEST',
      destination_url: OFFER_URL,
      original_destination_url: ORIGINAL_URL,
      channel: 'instagram',
      campaign_key: 'winner_camp',
    };
    const { supabase, inserts } = mockSupabase({ raceExisting: winner });
    const r = await recordAttributedClick(supabase as never, {
      offerId: OFFER_ID,
      clickerUserId: 'user-1',
      nowMs: NOW,
      hints: { channel: 'whatsapp', campaign: 'loser_camp' },
    });
    expect(r?.reused).toBe(true);
    expect(r?.clickId).toBe(EXISTING_ID);
    expect(r?.channel).toBe('instagram');
    expect(r?.campaignKey).toBe('winner_camp');
    expect(inserts).toHaveLength(1);
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
      offerId: OFFER_ID,
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
    expect(src).toMatch(/destinationUrl: click\?\.destinationUrl/);
    expect(src).toMatch(/originalDestinationUrl: click\?\.originalDestinationUrl/);
    expect(src).not.toMatch(/event_type:\s*'cazar_cta'/);
  });

  it('recordAttributedClick reused no usa fallbacks de request (ctx)', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib/attribution/recordAttributedClick.ts'),
      'utf8',
    );
    expect(src).toMatch(/canonicalFromPersistedRow/);
    expect(src).not.toMatch(/\?\? ctx\.channel/);
    expect(src).not.toMatch(/\?\? ctx\.campaignKey/);
    expect(src).not.toMatch(/\?\? destinations\./);
  });
});
