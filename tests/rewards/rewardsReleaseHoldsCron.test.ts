import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { requireCronSecret } from '../../lib/server/cronAuth';

const processExpiredRewardHolds = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/rewards/rewardsEngine', () => ({
  processExpiredRewardHolds: (...args: unknown[]) => processExpiredRewardHolds(...args),
}));

import { GET, POST } from '../../app/api/cron/rewards-release-holds/route';

describe('GET /api/cron/rewards-release-holds', () => {
  const prevSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-test-secret';
    processExpiredRewardHolds.mockReset();
    processExpiredRewardHolds.mockResolvedValue({ processed: 1 });
  });

  afterEach(() => {
    if (prevSecret !== undefined) process.env.CRON_SECRET = prevSecret;
    else delete process.env.CRON_SECRET;
  });

  it('endpoint sin autorización → rechazado', async () => {
    const req = new NextRequest('https://aventaofertas.com/api/cron/rewards-release-holds');
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(processExpiredRewardHolds).not.toHaveBeenCalled();
  });

  it('Authorization Bearer válido → libera holds vencidos', async () => {
    const req = new NextRequest('https://aventaofertas.com/api/cron/rewards-release-holds', {
      headers: { Authorization: 'Bearer cron-test-secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, processed: 1 });
    expect(processExpiredRewardHolds).toHaveBeenCalledTimes(1);
  });

  it('x-cron-secret válido → permitido', async () => {
    const req = new NextRequest('https://aventaofertas.com/api/cron/rewards-release-holds', {
      headers: { 'x-cron-secret': 'cron-test-secret' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it('?secret= en query → rechazado (solo headers en este cron)', async () => {
    const req = new NextRequest(
      'https://aventaofertas.com/api/cron/rewards-release-holds?secret=cron-test-secret',
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
    expect(processExpiredRewardHolds).not.toHaveBeenCalled();
  });

  it('no acepta parámetros financieros del cliente', async () => {
    const req = new NextRequest(
      'https://aventaofertas.com/api/cron/rewards-release-holds?userId=u1&rewardId=r1&amountCents=99999',
      { headers: { Authorization: 'Bearer cron-test-secret' } },
    );
    await GET(req);
    expect(processExpiredRewardHolds).toHaveBeenCalledTimes(1);
    expect(processExpiredRewardHolds.mock.calls[0]).toHaveLength(1);
  });

  it('POST → method not allowed', async () => {
    const res = await POST();
    expect(res.status).toBe(405);
    expect(processExpiredRewardHolds).not.toHaveBeenCalled();
  });
});

describe('requireCronSecret allowQuerySecret', () => {
  const prevSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-test-secret';
  });

  afterEach(() => {
    if (prevSecret !== undefined) process.env.CRON_SECRET = prevSecret;
    else delete process.env.CRON_SECRET;
  });

  it('legacy crons siguen aceptando query secret cuando allowQuerySecret=true', () => {
    const req = new NextRequest('https://aventaofertas.com/api/cron/daily-digest?secret=cron-test-secret');
    expect(requireCronSecret(req, { allowQuerySecret: true })).toBeNull();
  });
});
