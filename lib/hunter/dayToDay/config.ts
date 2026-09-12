/**
 * Flags Day-to-Day. Fail-closed: ausencia = apagado.
 * Enabled ≠ configured ≠ discovery ready.
 */
export const DAY_TO_DAY_ENV = {
  walmart_mx: 'DAY_TO_DAY_WALMART_ENABLED',
  bodega_aurrera_mx: 'DAY_TO_DAY_BODEGA_ENABLED',
  chedraui_mx: 'DAY_TO_DAY_CHEDRAUI_ENABLED',
  walmart_mx_discovery: 'DAY_TO_DAY_WALMART_DISCOVERY',
  bodega_aurrera_mx_discovery: 'DAY_TO_DAY_BODEGA_DISCOVERY',
  chedraui_mx_discovery: 'DAY_TO_DAY_CHEDRAUI_DISCOVERY',
  pilot: 'DAY_TO_DAY_PILOT',
  fixtures: 'DAY_TO_DAY_FIXTURES',
} as const;

export function isDayToDayFlagOn(envName: string): boolean {
  const raw = process.env[envName];
  return raw === '1' || raw === 'true';
}

export function isDayToDayPilotMode(): boolean {
  return isDayToDayFlagOn(DAY_TO_DAY_ENV.pilot);
}

export function isDayToDayFixturesMode(): boolean {
  return isDayToDayFlagOn(DAY_TO_DAY_ENV.fixtures);
}

/**
 * Presupuesto por ciclo. No crawl infinito.
 * Pilot recorta aún más.
 */
export const DAY_TO_DAY_RATE_POLICY = {
  maxPages: 2,
  maxItems: 12,
  timeoutMs: 12_000,
  concurrency: 1,
  requestsPerCycle: 8,
} as const;

export const DAY_TO_DAY_PILOT_RATE_POLICY = {
  maxPages: 1,
  maxItems: 8,
  timeoutMs: 12_000,
  concurrency: 1,
  requestsPerCycle: 5,
} as const;

export function dayToDayRatePolicyForRun() {
  return isDayToDayPilotMode() ? DAY_TO_DAY_PILOT_RATE_POLICY : DAY_TO_DAY_RATE_POLICY;
}
