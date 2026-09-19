/**
 * Staging soak canary — hard guardrails (no Telegram HTTP in these unit tests).
 */

import { describe, expect, it, vi } from 'vitest';
import {
  STAGING_SOAK_CANARY_DESTINATION_ID,
  STAGING_SOAK_CANARY_DESTINATION_SLUG,
  assertStagingSoakCanaryEnv,
  assertStagingSoakCanaryGuards,
  buildStagingSoakCanaryEnv,
  isStagingSoakCanaryOfferId,
} from '@/lib/distribution/stagingCanary';
import { isDistributionEngineEnabled } from '@/lib/distribution/constants';

describe('Staging soak canary — env guards', () => {
  it('aborts production target', () => {
    const r = assertStagingSoakCanaryEnv({
      NODE_ENV: 'test',
      AVENTA_SUPABASE_TARGET: 'production',
      NEXT_PUBLIC_SUPABASE_URL: 'https://oojshofrpbfwsiypcecr.supabase.co',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/target_not_staging/);
  });

  it('aborts production supabase ref', () => {
    const r = assertStagingSoakCanaryEnv({
      NODE_ENV: 'test',
      AVENTA_SUPABASE_TARGET: 'staging',
      NEXT_PUBLIC_SUPABASE_URL: 'https://mkgsrpsuvedwwlzmzmzh.supabase.co',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/supabase_ref_not_staging|production/);
  });

  it('accepts staging env', () => {
    const r = assertStagingSoakCanaryEnv({
      NODE_ENV: 'test',
      AVENTA_SUPABASE_TARGET: 'staging',
      AVENTA_DEPLOYMENT_SURFACE: 'staging',
      NEXT_PUBLIC_SUPABASE_URL: 'https://oojshofrpbfwsiypcecr.supabase.co',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.destinationId).toBe(STAGING_SOAK_CANARY_DESTINATION_ID);
      expect(r.destinationSlug).toBe(STAGING_SOAK_CANARY_DESTINATION_SLUG);
    }
  });

  it('canary env enables engine only in returned copy', () => {
    const base = {
      NODE_ENV: 'test' as const,
      DISTRIBUTION_ENGINE_ENABLED: '',
      AVENTA_SUPABASE_TARGET: 'staging',
      NEXT_PUBLIC_SUPABASE_URL: 'https://oojshofrpbfwsiypcecr.supabase.co',
    };
    expect(isDistributionEngineEnabled(base)).toBe(false);
    const canary = buildStagingSoakCanaryEnv(base);
    expect(isDistributionEngineEnabled(canary)).toBe(true);
    expect(isDistributionEngineEnabled(base)).toBe(false);
  });

  it('rejects malformed offer id', () => {
    expect(isStagingSoakCanaryOfferId('nope')).toBe(false);
    expect(isStagingSoakCanaryOfferId('a1111111-1111-4111-8111-111111111101')).toBe(true);
  });
});

describe('Staging soak canary — DB destination guards', () => {
  it('requires exactly one allowlisted active destination', async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({
            data: [
              {
                id: STAGING_SOAK_CANARY_DESTINATION_ID,
                slug: STAGING_SOAK_CANARY_DESTINATION_SLUG,
                provider: 'telegram',
                status: 'active',
                credential_ref: 'TELEGRAM_BOT_TOKEN_STAGING',
                external_destination_key: '-100430742251',
                display_name: 'Telegram Staging Test',
              },
            ],
            error: null,
          })),
        })),
      })),
    };

    const r = await assertStagingSoakCanaryGuards(client as never, {
      NODE_ENV: 'test',
      AVENTA_SUPABASE_TARGET: 'staging',
      AVENTA_DEPLOYMENT_SURFACE: 'staging',
      NEXT_PUBLIC_SUPABASE_URL: 'https://oojshofrpbfwsiypcecr.supabase.co',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
      TELEGRAM_BOT_TOKEN_STAGING: '123:ABC',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects wrong destination id', async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({
            data: [
              {
                id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
                slug: 'other',
                provider: 'telegram',
                status: 'active',
                credential_ref: 'TELEGRAM_BOT_TOKEN_STAGING',
                external_destination_key: '-1001',
                display_name: 'Other',
              },
            ],
            error: null,
          })),
        })),
      })),
    };
    const r = await assertStagingSoakCanaryGuards(client as never, {
      NODE_ENV: 'test',
      AVENTA_SUPABASE_TARGET: 'staging',
      AVENTA_DEPLOYMENT_SURFACE: 'staging',
      NEXT_PUBLIC_SUPABASE_URL: 'https://oojshofrpbfwsiypcecr.supabase.co',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
      TELEGRAM_BOT_TOKEN_STAGING: '123:ABC',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not_allowlisted/);
  });

  it('rejects STAGING_UNSET chat', async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({
            data: [
              {
                id: STAGING_SOAK_CANARY_DESTINATION_ID,
                slug: STAGING_SOAK_CANARY_DESTINATION_SLUG,
                provider: 'telegram',
                status: 'active',
                credential_ref: 'TELEGRAM_BOT_TOKEN_STAGING',
                external_destination_key: 'STAGING_UNSET',
                display_name: 'Telegram Staging Test',
              },
            ],
            error: null,
          })),
        })),
      })),
    };
    const r = await assertStagingSoakCanaryGuards(client as never, {
      NODE_ENV: 'test',
      AVENTA_SUPABASE_TARGET: 'staging',
      AVENTA_DEPLOYMENT_SURFACE: 'staging',
      NEXT_PUBLIC_SUPABASE_URL: 'https://oojshofrpbfwsiypcecr.supabase.co',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
      TELEGRAM_BOT_TOKEN_STAGING: '123:ABC',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/chat_id_not_provisioned/);
  });

  it('rejects fan-out (multiple active destinations)', async () => {
    const client = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({
            data: [
              {
                id: STAGING_SOAK_CANARY_DESTINATION_ID,
                slug: STAGING_SOAK_CANARY_DESTINATION_SLUG,
                provider: 'telegram',
                credential_ref: 'TELEGRAM_BOT_TOKEN_STAGING',
                external_destination_key: '-1001',
              },
              {
                id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                slug: 'extra',
                provider: 'telegram',
                credential_ref: 'TELEGRAM_BOT_TOKEN_STAGING',
                external_destination_key: '-1002',
              },
            ],
            error: null,
          })),
        })),
      })),
    };
    const r = await assertStagingSoakCanaryGuards(client as never, {
      NODE_ENV: 'test',
      AVENTA_SUPABASE_TARGET: 'staging',
      AVENTA_DEPLOYMENT_SURFACE: 'staging',
      NEXT_PUBLIC_SUPABASE_URL: 'https://oojshofrpbfwsiypcecr.supabase.co',
      AVENTA_EXPECTED_SUPABASE_REF: 'oojshofrpbfwsiypcecr',
      TELEGRAM_BOT_TOKEN_STAGING: '123:ABC',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/count_not_one/);
  });
});
