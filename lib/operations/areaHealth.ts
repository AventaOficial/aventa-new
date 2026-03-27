export type AreaId =
  | 'datos'
  | 'vista'
  | 'feed'
  | 'runtime'
  | 'observabilidad'
  | 'alertas';

export type AreaStatus = 'ok' | 'warn' | 'fail' | 'unknown';

export type PulseAlerts = {
  emailToConfigured: boolean;
  webhookConfigured: boolean;
  resendConfigured: boolean;
};

export type MinimalIntegrity = {
  ok: boolean;
  checks: { name: string; ok: boolean }[];
};

function checkOk(result: MinimalIntegrity | null, name: string): boolean | null {
  if (!result) return null;
  const c = result.checks.find((x) => x.name === name);
  if (!c) return null;
  return c.ok;
}

/** Deriva semáforos por área a partir del último resultado de integridad. */
export function deriveAreaStatusesFromIntegrity(result: MinimalIntegrity | null): Record<AreaId, AreaStatus> {
  if (!result) {
    return {
      datos: 'unknown',
      vista: 'unknown',
      feed: 'unknown',
      runtime: 'unknown',
      observabilidad: 'unknown',
      alertas: 'unknown',
    };
  }

  const datosChecks = ['categories.mapping', 'offers.category.integrity', 'offers.bank_coupon.integrity'].map((n) =>
    checkOk(result, n),
  );
  const datosFail = datosChecks.some((v) => v === false);
  const datosOk = datosChecks.every((v) => v === true);

  const vista = checkOk(result, 'view.ofertas_ranked_general');
  const feed = checkOk(result, 'feed.home.smoke');
  const runtime = checkOk(result, 'runtime.exception');

  return {
    datos: datosFail ? 'fail' : datosOk ? 'ok' : 'warn',
    vista: vista === false ? 'fail' : vista === true ? 'ok' : 'warn',
    feed: feed === false ? 'fail' : feed === true ? 'ok' : 'warn',
    runtime: runtime === false ? 'fail' : runtime === true ? 'ok' : 'warn',
    observabilidad: result.ok ? 'ok' : 'fail',
    alertas: 'unknown',
  };
}

/** Combina integridad + configuración de alertas en Vercel. */
export function applyAlertConfigToAreas(
  base: Record<AreaId, AreaStatus>,
  pulse: PulseAlerts | null,
): Record<AreaId, AreaStatus> {
  if (!pulse) return { ...base, alertas: 'unknown' };
  const emailPath = pulse.emailToConfigured && pulse.resendConfigured;
  const alertas: AreaStatus = pulse.webhookConfigured || emailPath ? 'ok' : 'warn';
  return { ...base, alertas };
}
