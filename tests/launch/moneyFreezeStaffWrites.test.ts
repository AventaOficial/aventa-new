import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPaidRewardClawbackAdjustment } from '../../lib/rewards/clawback';
import { assignManualLedgerAttribution } from '../../lib/rewards/manualAttribution';

const REWARD = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const LEDGER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const OFFER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR = '11111111-1111-1111-1111-111111111111';

function untouchableSupabase() {
  const from = vi.fn(() => {
    throw new Error('no debe tocar la base con el freeze activo');
  });
  return { client: { from } as unknown as SupabaseClient, from };
}

describe('money freeze — escrituras staff sobre tablas de dinero', () => {
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.MONEY_PATH_FROZEN;
    process.env.MONEY_PATH_FROZEN = 'true';
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.MONEY_PATH_FROZEN;
    else process.env.MONEY_PATH_FROZEN = prev;
  });

  it('clawback no inserta ajuste con freeze', async () => {
    const { client, from } = untouchableSupabase();
    const result = await createPaidRewardClawbackAdjustment(client, {
      rewardId: REWARD,
      actorId: ACTOR,
      reason: 'comisión void post-pago',
      ledgerEntryId: LEDGER,
    });
    expect(result).toEqual({ ok: false, error: 'money_path_frozen', status: 503 });
    expect(from).not.toHaveBeenCalled();
  });

  it('atribución manual no escribe el ledger con freeze', async () => {
    const { client, from } = untouchableSupabase();
    const result = await assignManualLedgerAttribution(client, {
      ledgerEntryId: LEDGER,
      offerId: OFFER,
      actorId: ACTOR,
      reason: 'staff_review',
    });
    expect(result).toEqual({ ok: false, error: 'money_path_frozen', status: 503 });
    expect(from).not.toHaveBeenCalled();
  });

  it('pools legacy no aceptan status paid', () => {
    const src = readFileSync(
      join(process.cwd(), 'app/api/admin/commissions/pools/route.ts'),
      'utf8',
    );
    const patch = src.slice(src.indexOf('export async function PATCH'));
    const guard = patch.indexOf("if (status === 'paid')");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(patch.indexOf(".from('commission_pools')"));
    expect(patch).toContain("code: 'legacy_commission_not_payable'");
  });
});
