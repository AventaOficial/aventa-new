/**
 * Distribution Engine P0-D3 — Telegram staging pipeline tests (mocked HTTP).
 */

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildDistributionIdempotencyKey,
  claimNextDistributionPublications,
  createTelegramAdapter,
  drainDistributionPublications,
  enqueueDistributionForApprovedOffer,
  escapeTelegramHtml,
  isDistributionEngineEnabled,
  isOfferSnapshotDistributable,
  redactTelegramSecrets,
  renderTelegramOfferMessage,
  resolveDistributionHop,
  resolveTelegramBotToken,
  assertSafeHttpsUrl,
  assertSafeRedirectUrl,
  DISTRIBUTION_ENGINE_BOUNDARIES,
} from '@/lib/distribution';

function chainable(result: { data?: unknown; error?: unknown } = { data: null, error: null }) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  for (const m of [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'in',
    'or',
    'order',
    'limit',
    'maybeSingle',
    'single',
  ]) {
    obj[m] = vi.fn(self);
  }
  obj.maybeSingle = vi.fn(async () => result);
  obj.single = vi.fn(async () => result);
  // terminal await on builder
  obj.then = undefined;
  return obj;
}

describe('P0-D3 — feature flag fail-closed', () => {
  it('16. flag OFF skips enqueue', async () => {
    const from = vi.fn();
    const r = await enqueueDistributionForApprovedOffer('11111111-1111-4111-8111-111111111111', {
      supabase: { from } as never,
      env: {},
    });
    expect(r).toEqual({ ok: true, skipped: 'flag_disabled' });
    expect(from).not.toHaveBeenCalled();
  });

  it('16b. flag OFF skips drain', async () => {
    const from = vi.fn();
    const r = await drainDistributionPublications({
      supabase: { from } as never,
      env: { DISTRIBUTION_ENGINE_ENABLED: 'false' },
    });
    expect(r).toEqual({
      ok: true,
      skipped: 'flag_disabled',
      claimed: 0,
      published: 0,
      retryable: 0,
      failed: 0,
      unknownOutcome: 0,
      blockedCredential: 0,
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('keeps money/supply boundaries', () => {
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.settlementEnabled).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.writesLedger).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.modifiesSupplyWrite).toBe(false);
    expect(DISTRIBUTION_ENGINE_BOUNDARIES.callsExternalProviders).toBe(false);
  });
});

describe('P0-D3 — eligibility gates', () => {
  it('1. approved can publish eligibility', () => {
    expect(isOfferSnapshotDistributable({ status: 'approved', expires_at: null }).ok).toBe(true);
  });
  it('2. pending cannot', () => {
    expect(isOfferSnapshotDistributable({ status: 'pending', expires_at: null }).ok).toBe(false);
  });
  it('3. rejected cannot', () => {
    expect(isOfferSnapshotDistributable({ status: 'rejected', expires_at: null }).ok).toBe(false);
  });
  it('4. expired cannot', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isOfferSnapshotDistributable({ status: 'approved', expires_at: past }).ok).toBe(false);
  });
});

describe('P0-D3 — idempotency key', () => {
  it('5. duplicate enqueue key is stable', () => {
    const a = buildDistributionIdempotencyKey({
      offerId: 'o1',
      destinationId: 'd1',
      distributionVersion: 1,
    });
    const b = buildDistributionIdempotencyKey({
      offerId: 'o1',
      destinationId: 'd1',
      distributionVersion: 1,
    });
    expect(a).toBe(b);
    expect(a).toBe('o1:d1:v1');
  });
});

describe('P0-D3 — atomic claim CAS', () => {
  it('6. concurrent claim: second update loses', async () => {
    let status = 'pending';
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'distribution_publications') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: 'p1',
                          offer_id: 'o1',
                          destination_id: 'd1',
                          status: 'pending',
                          provider: 'telegram',
                          attempt_count: 0,
                          external_destination_key: '-100',
                          tracking_campaign_key: 'tg',
                          idempotency_key: 'k',
                          external_message_id: null,
                          next_attempt_at: null,
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockReturnValue({
                  select: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockImplementation(async () => {
                      if (status !== 'pending' && status !== 'retryable') {
                        return { data: null, error: null };
                      }
                      status = 'publishing';
                      return {
                        data: {
                          id: 'p1',
                          offer_id: 'o1',
                          destination_id: 'd1',
                          status: 'publishing',
                          provider: 'telegram',
                          attempt_count: 1,
                          external_destination_key: '-100',
                          tracking_campaign_key: 'tg',
                          idempotency_key: 'k',
                          external_message_id: null,
                        },
                        error: null,
                      };
                    }),
                  }),
                }),
              }),
            })),
          };
        }
        if (table === 'distribution_events') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return chainable();
      }),
    };

    const first = await claimNextDistributionPublications(supabase as never, { limit: 1 });
    expect(first).toHaveLength(1);
    const second = await claimNextDistributionPublications(supabase as never, { limit: 1 });
    // candidate still returned by select mock, but CAS fails
    expect(second).toHaveLength(0);
  });
});

describe('P0-D3 — Telegram adapter', () => {
  it('9. success returns message_id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: { message_id: 42 } }),
    });
    const adapter = createTelegramAdapter({
      env: { TELEGRAM_BOT_TOKEN_STAGING: '123456:ABCDEFGHIJKLMNOPQRSTUV' },
      fetchImpl: fetchImpl as never,
    });
    const r = await adapter.publish({
      externalDestinationKey: '-100123',
      credentialRef: 'TELEGRAM_BOT_TOKEN_STAGING',
      text: 'hello',
      imageUrl: null,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.externalMessageId).toBe('42');
  });

  it('7. retryable on 429', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ ok: false, description: 'Too Many Requests', parameters: { retry_after: 3 } }),
    });
    const adapter = createTelegramAdapter({
      env: { TELEGRAM_BOT_TOKEN_STAGING: '123456:ABCDEFGHIJKLMNOPQRSTUV' },
      fetchImpl: fetchImpl as never,
    });
    const r = await adapter.publish({
      externalDestinationKey: '-100123',
      credentialRef: 'TELEGRAM_BOT_TOKEN_STAGING',
      text: 'hello',
      imageUrl: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryable).toBe(true);
  });

  it('8. permanent on 400 chat not found', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, description: 'Bad Request: chat not found' }),
    });
    const adapter = createTelegramAdapter({
      env: { TELEGRAM_BOT_TOKEN_STAGING: '123456:ABCDEFGHIJKLMNOPQRSTUV' },
      fetchImpl: fetchImpl as never,
    });
    const r = await adapter.publish({
      externalDestinationKey: '-100123',
      credentialRef: 'TELEGRAM_BOT_TOKEN_STAGING',
      text: 'hello',
      imageUrl: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryable).toBe(false);
  });

  it('18. token never accepted as credential_ref', () => {
    const r = resolveTelegramBotToken('123456:AAHsecretsecretsecretsecret', {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('credential_ref_looks_like_token');
  });

  it('18b. missing env is BLOCKED_EXTERNAL_CREDENTIAL', () => {
    const r = resolveTelegramBotToken('TELEGRAM_BOT_TOKEN_STAGING', {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('BLOCKED_EXTERNAL_CREDENTIAL');
  });

  it('redacts tokens in logs', () => {
    expect(redactTelegramSecrets('err 123456:AAHabcdefghijklmnopqrstuv')).toContain(
      '[REDACTED_BOT_TOKEN]',
    );
  });
});

describe('P0-D3 — renderer + URL safety', () => {
  it('10. escapes HTML injection', () => {
    expect(escapeTelegramHtml('<script>x</script>')).toBe(
      '&lt;script&gt;x&lt;/script&gt;',
    );
    const msg = renderTelegramOfferMessage({
      offer: {
        id: 'o',
        title: 'Oferta <b>raw</b>',
        store: 'Amazon',
        price: 100,
        original_price: 200,
        image_url: 'https://placehold.co/1.png',
      },
      ctaUrl: 'https://aventaofertas.com/r/d/11111111-1111-4111-8111-111111111111',
    });
    expect(msg.text).toContain('&lt;b&gt;');
    expect(msg.text).not.toContain('<script');
  });

  it('11. rejects malicious / private image URLs', () => {
    expect(assertSafeHttpsUrl('http://evil.com/x').ok).toBe(false);
    expect(assertSafeHttpsUrl('https://127.0.0.1/x').ok).toBe(false);
    expect(assertSafeHttpsUrl('https://169.254.169.254/latest').ok).toBe(false);
    expect(assertSafeHttpsUrl('javascript:alert(1)').ok).toBe(false);
    expect(assertSafeHttpsUrl('https://placehold.co/x.png').ok).toBe(true);
  });

  it('open redirect protection on hop targets', () => {
    expect(assertSafeRedirectUrl('javascript:alert(1)').ok).toBe(false);
    expect(assertSafeRedirectUrl('https://www.amazon.com.mx/dp/x').ok).toBe(true);
  });
});

describe('P0-D3 — /r/d hop', () => {
  it('12. records attribution and redirects from DB offer_url', async () => {
    const recordAttributedClick = vi.fn().mockResolvedValue({ clickId: 'c1' });
    vi.doMock('@/lib/attribution/recordAttributedClick', () => ({
      recordAttributedClick,
    }));

    // Direct unit of resolveDistributionHop with mocked supabase
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'distribution_publications') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: '11111111-1111-4111-8111-111111111101',
                    offer_id: '22222222-2222-4222-8222-222222222201',
                    destination_id: 'd1',
                    provider: 'telegram',
                    status: 'published',
                    tracking_campaign_key: 'tg-staging-test',
                    published_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'offers') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: '22222222-2222-4222-8222-222222222201',
                    status: 'approved',
                    expires_at: null,
                    offer_url: 'https://www.amazon.com.mx/dp/B0TEST',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'distribution_events') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        if (table === 'reward_outbound_clicks') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'click-1',
                    offer_id: '22222222-2222-4222-8222-222222222201',
                    network: 'amazon',
                    product_fingerprint: null,
                    destination_url: 'https://www.amazon.com.mx/dp/B0TEST',
                    original_destination_url: null,
                    channel: 'telegram',
                    campaign_key: 'tg-staging-test',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return chainable();
      }),
    };

    const result = await resolveDistributionHop({
      publicationId: '11111111-1111-4111-8111-111111111101',
      supabase: supabase as never,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.redirectUrl).toContain('amazon.com.mx');
    }
  });

  it('13. expired offer → 410', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'distribution_publications') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: '11111111-1111-4111-8111-111111111101',
                    offer_id: '22222222-2222-4222-8222-222222222201',
                    destination_id: 'd1',
                    provider: 'telegram',
                    status: 'published',
                    tracking_campaign_key: 'tg',
                    published_at: new Date().toISOString(),
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'offers') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: '22222222-2222-4222-8222-222222222201',
                    status: 'approved',
                    expires_at: past,
                    offer_url: 'https://www.amazon.com.mx/dp/B0TEST',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return chainable();
      }),
    };
    const result = await resolveDistributionHop({
      publicationId: '11111111-1111-4111-8111-111111111101',
      supabase: supabase as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('offer_expired');
  });

  it('14. invalid publication id', async () => {
    const result = await resolveDistributionHop({
      publicationId: 'not-a-uuid',
      supabase: { from: vi.fn() } as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});

describe('P0-D3 — destination disabled + drain gates', () => {
  it('15. disabled destinations are not selected by enqueue (status=active filter)', async () => {
    // enqueue only loads status=active — verified by source contract
    const enqueueSrc = readFileSync(
      join(process.cwd(), 'lib/distribution/enqueue.ts'),
      'utf8',
    );
    expect(enqueueSrc).toMatch(/\.eq\('status', 'active'\)/);
  });

  it('drain cancels when destination not active', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'distribution_publications') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                or: vi.fn().mockReturnValue({
                  order: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: 'p1',
                          offer_id: 'o1',
                          destination_id: 'd1',
                          status: 'pending',
                          provider: 'telegram',
                          attempt_count: 0,
                          external_destination_key: 'STAGING_UNSET',
                          tracking_campaign_key: 'tg',
                          idempotency_key: 'k',
                          external_message_id: null,
                          next_attempt_at: null,
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            update: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
              updates.push(payload);
              return {
                eq: vi.fn().mockReturnValue({
                  in: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: {
                          id: 'p1',
                          offer_id: 'o1',
                          destination_id: 'd1',
                          status: 'publishing',
                          provider: 'telegram',
                          attempt_count: 1,
                          external_destination_key: 'STAGING_UNSET',
                          tracking_campaign_key: 'tg',
                          idempotency_key: 'k',
                          external_message_id: null,
                        },
                        error: null,
                      }),
                    }),
                  }),
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }),
              };
            }),
          };
        }
        if (table === 'distribution_destinations') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'd1',
                    status: 'disabled',
                    credential_ref: 'TELEGRAM_BOT_TOKEN_STAGING',
                    external_destination_key: 'STAGING_UNSET',
                    display_name: 'Telegram Staging Test',
                    provider: 'telegram',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'distribution_events') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return chainable();
      }),
    };

    const r = await drainDistributionPublications({
      supabase: supabase as never,
      env: { DISTRIBUTION_ENGINE_ENABLED: 'true' },
      limit: 1,
    });
    expect(r.claimed).toBe(1);
    expect(r.failed).toBe(1);
    expect(updates.some((u) => u.status === 'cancelled')).toBe(true);
  });
});

describe('P0-D3 — source guards', () => {
  it('17. production ref guard tests still exist', () => {
    const guard = readFileSync(
      join(process.cwd(), 'tests/supabase/projectRefs.guard.test.ts'),
      'utf8',
    );
    expect(guard).toMatch(/oojshofrpbfwsiypcecr|mkgsrpsuvedwwlzmzmzh|AVENTA_EXPECTED/);
  });

  it('19-20. moderate-offer only fire-and-forget enqueue (no Telegram sync)', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/admin/moderate-offer/route.ts'),
      'utf8',
    );
    expect(src).toMatch(/enqueueDistributionForApprovedOfferFireAndForget/);
    expect(src).not.toMatch(/api\.telegram\.org/);
    expect(src).not.toMatch(/drainDistribution/);
  });

  it('cron uses requireCronSecret and is not in vercel.json', () => {
    const cron = readFileSync(
      join(process.cwd(), 'app/api/cron/distribution-drain/route.ts'),
      'utf8',
    );
    expect(cron).toMatch(/requireCronSecret/);
    const vercel = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8');
    expect(vercel).not.toMatch(/distribution-drain/);
  });

  it('hop route exists', () => {
    const hop = readFileSync(
      join(process.cwd(), 'app/r/d/[publicationId]/route.ts'),
      'utf8',
    );
    expect(hop).toMatch(/resolveDistributionHop/);
    expect(hop).toMatch(/NextResponse\.redirect/);
  });

  it('P0-D3.1 staging SQL mirrors canonical reward_outbound_clicks (no money)', () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        'docs/supabase-migrations/STAGING_P0D3_1_REWARD_OUTBOUND_CLICK_20260917.sql',
      ),
      'utf8',
    );
    expect(sql).toMatch(/oojshofrpbfwsiypcecr/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.reward_outbound_clicks/);
    expect(sql).toMatch(/idempotency_key/);
    expect(sql).toMatch(/idx_reward_outbound_clicks_idempotency/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.reward_outbound_clicks FROM anon/);
    expect(sql).toMatch(/GRANT ALL ON TABLE public\.reward_outbound_clicks TO service_role/);
    expect(sql).toMatch(/to_regclass\('public\.ofertas'\)/);
    expect(sql).not.toMatch(/CREATE TABLE[\s\S]*creator_rewards/);
    expect(sql).not.toMatch(/CREATE TABLE[\s\S]*reward_payouts/);
    expect(sql).not.toMatch(/\bDROP TABLE\b/);
    expect(sql).not.toMatch(/^\s*TRUNCATE\b/m);
    expect(sql).not.toMatch(/^\s*DELETE\b/m);
    expect(sql).not.toMatch(/publication_id/);
  });
});
