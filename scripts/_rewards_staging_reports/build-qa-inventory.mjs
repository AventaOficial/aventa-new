/**
 * Staging QA inventory (read-only). Uses .env.staging.local — never prints secrets.
 * node scripts/_rewards_staging_reports/build-qa-inventory.mjs
 */
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { STAGING_SUPABASE_REF } from '../lib/supabaseProjectRefs.mjs';

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

const root = join(process.cwd());
const env = {
  ...loadEnvFile(join(root, '.env.local')),
  ...loadEnvFile(join(root, '.env.staging.local')),
  ...process.env,
};
const url = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!url.includes(STAGING_SUPABASE_REF) || !key) {
  console.error('staging credentials missing or wrong ref');
  process.exit(2);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

function walkIds(obj, out) {
  if (obj == null) return;
  if (typeof obj === 'string') {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(obj)) {
      out.add(obj);
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (const x of obj) walkIds(x, out);
    return;
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) walkIds(v, out);
  }
}

const reportPaths = [
  'scripts/_rewards_staging_reports/verify-rewards-staging-latest.json',
  'scripts/_m54_reports/m5-4-available-payout-intent-canary-latest.json',
  'scripts/_m55_reports/m5-5-reserved-payout-submit-canary-latest.json',
  'scripts/_m56_reports/m5-6-provider-confirmation-canary-latest.json',
];
function readJsonFile(p) {
  let raw = readFileSync(p);
  if (raw[0] === 0xff && raw[1] === 0xfe) {
    raw = raw.toString('utf16le').replace(/^\uFEFF/, '');
  } else {
    raw = raw.toString('utf8').replace(/^\uFEFF/, '');
  }
  return JSON.parse(raw);
}

const CANARY_REPORT_PATHS = reportPaths.filter((r) => /_m5[456]_reports\//.test(r));

function discoverSessionCanaries() {
  const canaries = [];
  for (const rel of CANARY_REPORT_PATHS) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    try {
      const j = readJsonFile(p);
      if (!j?.tag) continue;
      const stamp = String(j.tag).replace(/^m5\d+_/, '');
      canaries.push({
        campaign: j.campaign ?? rel,
        tag: j.tag,
        stamp,
      });
    } catch {
      /* skip unreadable report */
    }
  }
  return canaries;
}

function collectSharedFixtures() {
  const excludeIds = new Set();
  const fixtures = { offerId: null, creatorId: null, clickerId: null };
  for (const rel of CANARY_REPORT_PATHS) {
    const p = join(root, rel);
    if (!existsSync(p)) continue;
    try {
      const f = readJsonFile(p).fixtures;
      if (!f?.ok) continue;
      if (f.offerId) {
        fixtures.offerId = f.offerId;
        excludeIds.add(f.offerId);
      }
      if (f.creatorId) {
        fixtures.creatorId = f.creatorId;
        excludeIds.add(f.creatorId);
      }
      if (f.clickerId) {
        fixtures.clickerId = f.clickerId;
        excludeIds.add(f.clickerId);
      }
    } catch {
      /* skip */
    }
  }
  return { excludeIds, fixtures };
}

const reportIds = new Set();
for (const rel of reportPaths) {
  const p = join(root, rel);
  if (!existsSync(p)) continue;
  try {
    walkIds(readJsonFile(p), reportIds);
  } catch (e) {
    console.error(`skip ${rel}: ${e.message}`);
  }
}

async function countIn(table, col, ids) {
  if (ids.length === 0) return { count: 0, sample: [] };
  const { data, error, count } = await sb
    .from(table)
    .select('id', { count: 'exact' })
    .in(col, ids.slice(0, 200));
  if (error) return { error: error.message, count: null, sample: [] };
  return { count: count ?? data?.length ?? 0, sample: (data ?? []).slice(0, 5).map((r) => r.id) };
}

async function likeCount(table, col, pattern, select = 'id') {
  const { data, error, count } = await sb
    .from(table)
    .select(select, { count: 'exact' })
    .like(col, pattern)
    .limit(500);
  if (error) return { error: error.message, count: null, ids: [] };
  const rows = data ?? [];
  return {
    count: count ?? rows.length,
    ids: rows.map((r) => r.id),
    extra: rows.slice(0, 3),
  };
}

async function queryByStamp(stamp) {
  const prefixes = ['m54', 'm55', 'm56'];
  const out = { stamp, offers: {}, conversions: {}, commissions: {}, clicks: {} };
  for (const p of prefixes) {
    out.offers[`${p}`] = await likeCount('offers', 'title', `%[${p === 'm54' ? 'M5.4' : p === 'm55' ? 'M5.5' : 'M5.6'} ${stamp}]%`, 'id,title');
    out.conversions[`${p}`] = await likeCount(
      'affiliate_conversions',
      'external_conversion_id',
      `${p}-conv-%${stamp}%`,
    );
    out.commissions[`${p}`] = await likeCount(
      'affiliate_commissions',
      'external_commission_id',
      `${p}-comm-%${stamp}%`,
    );
    out.clicks[`${p}`] = await likeCount('attributed_clicks', 'ip', `${p}-%${stamp}%`);
  }
  out.providerRefs = await likeCount(
    'payout_intents',
    'provider_reference',
    `m56-canary-ext-%${stamp}%`,
    'id,provider_reference,reward_id,status',
  );
  return out;
}

async function manualQaOffers() {
  const { data, error, count } = await sb
    .from('offers')
    .select('id, title, created_by, created_at', { count: 'exact' })
    .like('title', '[QA qa-%')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return { error: error.message };
  const runIds = new Set();
  for (const o of data ?? []) {
    const m = String(o.title).match(/\[QA (qa-\d+)\]/);
    if (m) runIds.add(m[1]);
  }
  return {
    count: count ?? data?.length ?? 0,
    runIds: [...runIds],
    offerIds: (data ?? []).map((o) => o.id),
    createdBy: [...new Set((data ?? []).map((o) => o.created_by))],
    titlesSample: (data ?? []).slice(0, 3).map((o) => o.title),
  };
}

const reportIdList = [...reportIds];
const rewards = await countIn('creator_rewards', 'id', reportIdList);
const intents = await countIn('payout_intents', 'id', reportIdList);
const intentsByReward = await countIn('payout_intents', 'reward_id', reportIdList);

const sessionCanaries = discoverSessionCanaries();
const stampQueries = {};
for (const c of sessionCanaries) {
  if (!c.stamp) continue;
  stampQueries[c.tag] = await queryByStamp(c.stamp);
}

const manual = await manualQaOffers();

const ledgerStagingQa = await sb
  .from('affiliate_ledger_entries')
  .select('id, external_ref', { count: 'exact' })
  .contains('meta', { staging_qa: true })
  .limit(50);

const { excludeIds: fixtureExcludeIds, fixtures: sharedFixtures } = collectSharedFixtures();
const ownedReportIds = reportIdList.filter(
  (id) => !fixtureExcludeIds.has(id) && id !== '00000000-0000-4000-8000-000000000099',
);

function unionStampIds(stampScoped, kind) {
  const ids = new Set();
  for (const block of Object.values(stampScoped)) {
    for (const p of ['m54', 'm55', 'm56']) {
      for (const x of block[kind]?.[p]?.ids ?? []) ids.add(x);
    }
  }
  return [...ids];
}

const allConversionIds = unionStampIds(stampQueries, 'conversions');
const allCommissionIds = unionStampIds(stampQueries, 'commissions');
const ledgerByCommission = await sb
  .from('affiliate_ledger_entries')
  .select('id, commission_id, external_ref', { count: 'exact' })
  .in('commission_id', allCommissionIds.slice(0, 200))
  .limit(500);

const rewardsByLedger = await sb
  .from('creator_rewards')
  .select('id, ledger_entry_id, status', { count: 'exact' })
  .in(
    'ledger_entry_id',
    (ledgerByCommission.data ?? []).map((r) => r.id).slice(0, 200),
  )
  .limit(500);

const manualOfferIds = manual.offerIds ?? [];
const votesManual = manualOfferIds.length
  ? await sb
      .from('offer_votes')
      .select('id, offer_id, user_id', { count: 'exact' })
      .in('offer_id', manualOfferIds)
      .limit(500)
  : { count: 0, data: [] };

const offersDetail = manualOfferIds.length
  ? await sb.from('offers').select('id, title, created_by').in('id', manualOfferIds)
  : { data: [] };

const auditForSession = await sb
  .from('reward_audit_log')
  .select('id, entity_id, event_type', { count: 'exact' })
  .in('entity_id', ownedReportIds.slice(0, 100))
  .limit(500);

const inventory = {
  generatedAt: new Date().toISOString(),
  projectRef: STAGING_SUPABASE_REF,
  session: { canaries: sessionCanaries },
  reportDerivedUuidCount: reportIdList.length,
  tablesFromReportIds: {
    creator_rewards_by_id: rewards,
    payout_intents_by_id: intents,
    payout_intents_by_reward_id: intentsByReward,
  },
  stampScopedRows: stampQueries,
  stagingManualQa: manual,
  verifyScriptLedgerQa: {
    count: ledgerStagingQa.count ?? ledgerStagingQa.data?.length ?? 0,
    ids: (ledgerStagingQa.data ?? []).map((r) => r.id),
    external_refs: (ledgerStagingQa.data ?? []).map((r) => r.external_ref),
  },
  sharedFixtureWarning: {
    ...sharedFixtures,
    note: 'Reused staging canary fixture — NOT owned by this session; exclude from delete.',
  },
  economyChain: {
    conversionIdsSessionScoped: allConversionIds,
    commissionIdsSessionScoped: allCommissionIds,
    ledgerEntries: {
      count: ledgerByCommission.count ?? ledgerByCommission.data?.length ?? 0,
      ids: (ledgerByCommission.data ?? []).map((r) => r.id),
      byCommission: ledgerByCommission.data ?? [],
    },
    rewardsFromLedgers: {
      count: rewardsByLedger.count ?? rewardsByLedger.data?.length ?? 0,
      rows: rewardsByLedger.data ?? [],
    },
  },
  stagingManualQaDetail: {
    offers: offersDetail.data ?? [],
    votes: {
      count: votesManual.count ?? votesManual.data?.length ?? 0,
      ids: (votesManual.data ?? []).map((r) => r.id),
      rows: votesManual.data ?? [],
    },
  },
  rewardAuditLogSession: {
    count: auditForSession.count ?? auditForSession.data?.length ?? 0,
    rows: auditForSession.data ?? [],
  },
  ownedReportIds,
  reportIdList,
};

const outPath = join(root, 'scripts/_rewards_staging_reports/qa-inventory-session.json');
writeFileSync(outPath, JSON.stringify(inventory, null, 2));
console.log(`wrote ${outPath}`);
console.log(
  JSON.stringify(
    {
      reportUuids: reportIdList.length,
      manualQaOffers: manual.count,
      manualRunIds: manual.runIds,
      stampQueryTags: Object.keys(stampQueries),
    },
    null,
    2,
  ),
);
