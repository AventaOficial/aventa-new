/**
 * Flags de Day-to-Day. Fail-closed: ausencia = apagado.
 * Enabled ≠ configured. Encender la flag no inventa un método de discovery.
 */
export const DAY_TO_DAY_ENV = {
  walmart_mx: 'DAY_TO_DAY_WALMART_ENABLED',
  bodega_aurrera_mx: 'DAY_TO_DAY_BODEGA_ENABLED',
  chedraui_mx: 'DAY_TO_DAY_CHEDRAUI_ENABLED',
} as const;

export function isDayToDayFlagOn(envName: string): boolean {
  const raw = process.env[envName];
  return raw === '1' || raw === 'true';
}

/**
 * Presupuesto por ciclo. No es un crawler: si un adapter algún día descubre,
 * no puede paginar sin techo. Los adapters actuales no hacen requests.
 */
export const DAY_TO_DAY_RATE_POLICY = {
  maxPages: 1,
  maxItems: 12,
  timeoutMs: 12_000,
  concurrency: 1,
  requestsPerCycle: 0,
} as const;
