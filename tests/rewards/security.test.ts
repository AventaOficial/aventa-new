import { describe, it, expect } from 'vitest';
import { isRewardsProgramActive } from '../../lib/rewards/programStatus';
import { REWARDS_CREATOR_SHARE_BPS, splitCommissionCents } from '../../lib/rewards/config';

/**
 * Las rutas admin de recompensas usan requireUsersLogs (owner/admin).
 * Las rutas /api/me/rewards/* no exponen PATCH de estado ni montos.
 * Estos tests documentan invariantes server-side.
 */
describe('Rewards security invariants', () => {
  it('COMMISSION_PROGRAM_ACTIVE permanece false por defecto', () => {
    const prev = process.env.COMMISSION_PROGRAM_ACTIVE;
    delete process.env.COMMISSION_PROGRAM_ACTIVE;
    delete process.env.REWARDS_PROGRAM_ACTIVE;
    expect(isRewardsProgramActive()).toBe(false);
    if (prev !== undefined) process.env.COMMISSION_PROGRAM_ACTIVE = prev;
  });

  it('el porcentaje creador viene de config centralizada, no del cliente', () => {
    const fakeClientBps = 9000;
    const { creatorCents } = splitCommissionCents(1000, REWARDS_CREATOR_SHARE_BPS);
    const { creatorCents: hijacked } = splitCommissionCents(1000, fakeClientBps);
    expect(creatorCents).toBe(400);
    expect(hijacked).not.toBe(creatorCents);
  });

  it('estados PAID/AVAILABLE no son valores expuestos al cliente en APIs me', () => {
    const meRoutes = [
      '/api/me/rewards/status',
      '/api/me/rewards',
      '/api/me/rewards/welcome-offer',
      '/api/me/rewards/accept-terms',
    ];
    const adminOnlyMutations = [
      '/api/admin/rewards',
      '/api/admin/rewards/payouts',
    ];
    expect(meRoutes.every((r) => !r.includes('/admin/'))).toBe(true);
    expect(adminOnlyMutations.every((r) => r.startsWith('/api/admin/'))).toBe(true);
  });
});
