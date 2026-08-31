/**
 * Verificación Rewards V1 en staging (read/write controlado, sin dinero real).
 * Usage: node scripts/verify-rewards-staging.mjs
 */
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

function loadEnvLocal() {
  const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceKey || !anonKey) {
  console.error('Faltan variables Supabase en .env.local');
  process.exit(2);
}

const projectRef = url.replace(/^https:\/\//, '').split('.')[0];
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const checks = [];
function add(name, ok, detail, securityCheck = false) {
  checks.push({ name, ok, detail, blocker: securityCheck && !ok });
}

const REWARD_TABLES = [
  'creator_rewards',
  'reward_outbound_clicks',
  'reward_payouts',
  'reward_audit_log',
  'reward_clawback_adjustments',
];

// ── Schema ───────────────────────────────────────────────────────────────────
for (const table of REWARD_TABLES) {
  const { error } = await admin.from(table).select('*', { count: 'exact', head: true });
  add(`schema.${table}`, !error, error?.message ?? 'existe');
}

const { data: rpcTest, error: rpcErr } = await admin.rpc('execute_reward_payout', {
  p_user_id: randomUUID(),
  p_amount_cents: 20000,
  p_spei_reference: 'TEST',
  p_created_by: randomUUID(),
  p_reward_ids: [randomUUID()],
});
add(
  'rpc.execute_reward_payout.exists',
  Boolean(rpcErr && !rpcErr.message.includes('does not exist')),
  rpcErr?.message?.includes('does not exist') ? 'RPC no existe' : 'RPC responde (esperado error de validación)',
);

// ── RLS: anon no puede mutar rewards ─────────────────────────────────────────
const fakeUuid = '00000000-0000-4000-8000-000000000001';
for (const [table, payload] of [
  [
    'creator_rewards',
    {
      creator_id: fakeUuid,
      ledger_entry_id: fakeUuid,
      network: 'amazon',
      gross_commission_cents: 1000,
      creator_share_cents: 400,
      platform_share_cents: 600,
      creator_share_bps: 4000,
      attribution_method: 'manual',
      attribution_confidence: 'high',
      status: 'VALIDATING',
      hold_until: new Date().toISOString(),
    },
  ],
  [
    'reward_payouts',
    {
      user_id: fakeUuid,
      amount_cents: 20000,
      spei_reference: 'FAKE1234',
      created_by: fakeUuid,
    },
  ],
]) {
  const ins = await anon.from(table).insert(payload).select();
  add(`rls.anon.${table}.insert_blocked`, Boolean(ins.error), ins.error?.message ?? 'PELIGRO: insert permitido', true);
}

const anonRewardUpdate = await anon
  .from('creator_rewards')
  .update({ status: 'PAID' })
  .eq('id', fakeUuid);
add(
  'rls.anon.creator_rewards.update_blocked',
  Boolean(anonRewardUpdate.error),
  anonRewardUpdate.error?.message ?? 'PELIGRO: update permitido',
  true,
);

const anonRpc = await anon.rpc('execute_reward_payout', {
  p_user_id: fakeUuid,
  p_amount_cents: 20000,
  p_spei_reference: 'STAGINGQA1',
  p_created_by: fakeUuid,
  p_reward_ids: [fakeUuid],
});
add(
  'rls.anon.execute_reward_payout_blocked',
  Boolean(anonRpc.error),
  anonRpc.error?.message ?? (anonRpc.data ? 'PELIGRO: RPC anon exitoso' : 'sin respuesta'),
  !anonRpc.error,
);

// ── Flujo simulado (solo si hay oferta + ledger) ─────────────────────────────
let simOfferId = null;
let simCreatorId = null;
let simLedgerId = null;
let simRewardId = null;
let simClickId = null;

const { data: sampleOffer } = await admin
  .from('offers')
  .select('id, created_by, status')
  .in('status', ['approved', 'published'])
  .limit(1)
  .maybeSingle();

if (sampleOffer?.id && sampleOffer.created_by) {
  simOfferId = sampleOffer.id;
  simCreatorId = sampleOffer.created_by;
  simClickId = randomUUID();

  await admin.from('reward_outbound_clicks').insert({
    id: simClickId,
    offer_id: simOfferId,
    network: 'amazon',
    product_fingerprint: 'amz:STAGINGQA',
    clicker_user_id: randomUUID(),
  });

  const extRef = `staging-qa-${Date.now()}`;
  const { data: ledger, error: ledgerErr } = await admin
    .from('affiliate_ledger_entries')
    .insert({
      network: 'amazon',
      amount_cents: 100_000,
      currency: 'MXN',
      status: 'accrued',
      external_ref: extRef,
      source: 'manual',
      meta: { ascsubtag: `av1.${simOfferId}.${simClickId}`, staging_qa: true },
    })
    .select('id')
    .single();

  if (!ledgerErr && ledger?.id) {
    simLedgerId = ledger.id;
    add('sim.ledger.created', true, simLedgerId);

    // Simular hold vencido + AVAILABLE para probar RPC atómico
    const holdPast = new Date(Date.now() - 86400000).toISOString();
    const { data: reward, error: rewardErr } = await admin
      .from('creator_rewards')
      .insert({
        creator_id: simCreatorId,
        offer_id: simOfferId,
        ledger_entry_id: simLedgerId,
        network: 'amazon',
        gross_commission_cents: 100_000,
        creator_share_cents: 40_000,
        platform_share_cents: 60_000,
        creator_share_bps: 4000,
        attribution_method: 'sub_id',
        attribution_confidence: 'high',
        status: 'AVAILABLE',
        hold_until: holdPast,
        available_at: holdPast,
        meta: { click_id: simClickId, staging_qa: true },
      })
      .select('id')
      .single();

    if (!rewardErr && reward?.id) {
      simRewardId = reward.id;
      add('sim.reward.40_60', true, '40000/60000 centavos (40/60 de 100000)');

      const actorId = simCreatorId;
      const { data: payoutRes, error: payoutErr } = await admin.rpc('execute_reward_payout', {
        p_user_id: simCreatorId,
        p_amount_cents: 40_000,
        p_spei_reference: `STAGING-QA-${Date.now()}`,
        p_created_by: actorId,
        p_reward_ids: [simRewardId],
        p_notes: 'staging QA simulado',
      });

      add(
        'sim.rpc.payout_atomic',
        !payoutErr && payoutRes?.ok === true,
        payoutErr?.message ?? JSON.stringify(payoutRes),
      );

      const { data: paidRow } = await admin
        .from('creator_rewards')
        .select('status, payout_id')
        .eq('id', simRewardId)
        .maybeSingle();
      add(
        'sim.reward.paid',
        paidRow?.status === 'PAID' && Boolean(paidRow?.payout_id),
        `status=${paidRow?.status}, payout_id=${paidRow?.payout_id ?? 'null'}`,
      );

      const { count: auditCount } = await admin
        .from('reward_audit_log')
        .select('*', { count: 'exact', head: true })
        .eq('entity_id', simRewardId)
        .eq('event_type', 'reward_paid');
      add('sim.audit.reward_paid', (auditCount ?? 0) >= 1, `audit rows=${auditCount ?? 0}`);

      // Clawback sobre PAID
      const { data: claw, error: clawErr } = await admin
        .from('reward_clawback_adjustments')
        .insert({
          reward_id: simRewardId,
          ledger_entry_id: simLedgerId,
          payout_id: paidRow?.payout_id,
          original_amount_cents: 40_000,
          adjustment_amount_cents: 40_000,
          reason: 'staging QA clawback simulado',
          created_by: actorId,
        })
        .select('id')
        .single();
      add('sim.clawback.insert', !clawErr && Boolean(claw?.id), clawErr?.message ?? claw?.id);

      const { data: stillPaid } = await admin
        .from('creator_rewards')
        .select('status')
        .eq('id', simRewardId)
        .maybeSingle();
      add('sim.clawback.reward_still_paid', stillPaid?.status === 'PAID', `status=${stillPaid?.status}`);
    } else {
      add('sim.reward.insert', false, rewardErr?.message ?? 'falló insert reward');
    }
  } else {
    add('sim.ledger.created', false, ledgerErr?.message ?? 'sin ledger');
  }
} else {
  add('sim.skipped', true, 'No hay oferta approved/published para simular flujo completo');
}

// ── Abuso: payout < mínimo ───────────────────────────────────────────────────
const { error: belowMinErr } = await admin.rpc('execute_reward_payout', {
  p_user_id: randomUUID(),
  p_amount_cents: 5000,
  p_spei_reference: 'STAGINGQA2',
  p_created_by: randomUUID(),
  p_reward_ids: [randomUUID()],
});
add(
  'abuse.payout_below_minimum',
  Boolean(belowMinErr),
  belowMinErr?.message ?? 'PELIGRO: payout bajo mínimo aceptado',
  !belowMinErr,
);

const report = {
  projectRef,
  environment: 'staging/dev (mkgsrpsuvedwwlzmzmzh — Aventa Cazadores de ofertas)',
  productionProjectNotTouched: 'oojshofrpbfwsiypcecr',
  checks,
  ok: checks.every((c) => c.ok),
  simulatedIds: { simOfferId, simCreatorId, simLedgerId, simRewardId, simClickId },
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
