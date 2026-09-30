import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const dispatchMock = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => ({ tag: 'service-role' })),
}));

vi.mock('@/lib/economy/settlement/reversalRecoveryDispatch', () => ({
  dispatchSettlementReversalRecovery: (...args: unknown[]) => dispatchMock(...args),
}));

import { GET, POST } from '@/app/api/cron/settlement-reversal-recovery/route';

describe('GET /api/cron/settlement-reversal-recovery', () => {
  const prevSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-test-secret';
    dispatchMock.mockReset();
    dispatchMock.mockResolvedValue({
      ok: true,
      blocked: false,
      reason: null,
      scanned: 1,
      eligible: 1,
      recovered: 1,
      reused: 0,
      skipped: 0,
      failed: 0,
      deferred: 0,
      failures: [],
    });
  });

  afterEach(() => {
    if (prevSecret !== undefined) process.env.CRON_SECRET = prevSecret;
    else delete process.env.CRON_SECRET;
  });

  it('rejects a request without the cron secret', async () => {
    const res = await GET(new NextRequest('https://aventaofertas.com/api/cron/settlement-reversal-recovery'));
    expect(res.status).toBe(401);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('rejects a query secret', async () => {
    const res = await GET(
      new NextRequest('https://aventaofertas.com/api/cron/settlement-reversal-recovery?secret=cron-test-secret'),
    );
    expect(res.status).toBe(401);
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('runs the dispatcher with the service client and ignores caller ids', async () => {
    const res = await GET(
      new NextRequest(
        'https://aventaofertas.com/api/cron/settlement-reversal-recovery?commissionId=evil&amount_cents=1&network=amazon',
        { headers: { Authorization: 'Bearer cron-test-secret' } },
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recovered).toBe(1);
    expect(dispatchMock).toHaveBeenCalledTimes(1);
    expect(dispatchMock.mock.calls[0]).toEqual([{ tag: 'service-role' }]);
  });

  it('POST is not allowed', async () => {
    const res = await POST();
    expect(res.status).toBe(405);
    expect(dispatchMock).not.toHaveBeenCalled();
  });
});
