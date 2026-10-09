export const PRODUCTION_SUPABASE_REF = 'mkgsrpsuvedwwlzmzmzh';
export const STAGING_SUPABASE_REF = 'oojshofrpbfwsiypcecr';

export const E2E_CASES = [
  'discover-offers',
  'open-offer',
  'publish-pending',
  'vote',
  'comment',
  'favorite',
  'takedown-approved',
  'takedown-published',
  'second-client',
  'refresh-and-pagination',
  'moderation-forbidden',
  'paused-rewards',
  'no-money-movement',
];

export function assertIsolatedBaseUrl(raw) {
  let url;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    throw new Error('e2e refused: invalid url');
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:') throw new Error('e2e refused: https required');
  if (host === 'aventaofertas.com' || host === 'www.aventaofertas.com' || host.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('e2e refused: production host');
  }
  return url;
}

export function assertIsolatedDeployment(health) {
  const ref = health?.health?.resolved_supabase_ref ?? null;
  if (ref === PRODUCTION_SUPABASE_REF) throw new Error('e2e refused: production supabase');
  if (ref !== STAGING_SUPABASE_REF) throw new Error('e2e refused: target is not isolated staging');
  return ref;
}

export function summarizeCases(cases) {
  const known = new Set(E2E_CASES);
  for (const row of cases) {
    if (!known.has(row.id)) throw new Error('e2e summary refused: unknown case');
    if (!['passed', 'failed', 'skipped'].includes(row.status)) {
      throw new Error('e2e summary refused: unknown status');
    }
  }
  const passed = cases.filter((row) => row.status === 'passed').length;
  const failed = cases.filter((row) => row.status === 'failed').length;
  const skipped = cases.filter((row) => row.status === 'skipped').length;
  return {
    total: cases.length,
    executed: passed + failed,
    passed,
    failed,
    skipped,
  };
}

export function assertSummaryGate(summary) {
  if (summary.total !== E2E_CASES.length || summary.failed > 0 || summary.skipped > 0) {
    throw new Error('e2e gate refused: unexecuted or failed cases');
  }
  return summary;
}
