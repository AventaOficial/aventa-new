/**
 * Runtime flags del money path — lectura pura de env (sin efectos).
 */

import { evaluateControlledActivationReadiness } from '@/lib/economy/controlledActivationReadiness';
import type { PayoutOpsRuntime, PayoutProviderMode } from './types';

export function describePayoutProvider(
  env: NodeJS.ProcessEnv,
  productionRuntime: boolean,
): PayoutOpsRuntime['payoutProvider'] {
  const raw = (env.PAYOUT_PROVIDER ?? '').trim().toLowerCase();
  const configured = raw || null;

  if (productionRuntime) {
    return {
      configured,
      mode: 'forbidden_production',
      detail: 'Producción: PAYOUT_PROVIDER bloqueado fail-closed (sin gate de activación).',
    };
  }
  if (!raw) {
    return {
      configured,
      mode: 'none',
      detail: 'PAYOUT_PROVIDER no definido (stub|sandbox|manual_spei|real).',
    };
  }
  const known: Record<string, PayoutProviderMode> = {
    stub: 'stub',
    sandbox: 'sandbox',
    manual_spei: 'manual_spei',
    real: 'real',
  };
  const mode = known[raw];
  if (!mode) {
    return { configured, mode: 'invalid', detail: `PAYOUT_PROVIDER="${raw}" desconocido.` };
  }
  if (mode === 'real') {
    const hasUrl = !!(env.PAYOUT_PROVIDER_API_URL ?? '').trim();
    const hasKey = !!(env.PAYOUT_PROVIDER_API_KEY ?? '').trim();
    if (!hasUrl || !hasKey) {
      return {
        configured,
        mode: 'invalid',
        detail: 'PAYOUT_PROVIDER=real sin PAYOUT_PROVIDER_API_URL / API_KEY (fail-closed, sin fallback).',
      };
    }
    return { configured, mode, detail: 'Proveedor real configurado con credenciales.' };
  }
  return {
    configured,
    mode,
    detail:
      mode === 'manual_spei'
        ? 'SPEI manual: intents existen, el envío lo hace finance en banca.'
        : `Modo ${mode}: no mueve dinero real.`,
  };
}

export function resolvePayoutOpsRuntime(env: NodeJS.ProcessEnv = process.env): PayoutOpsRuntime {
  const report = evaluateControlledActivationReadiness();
  return {
    productionRuntime: report.productionRuntime,
    moneyPathFrozen: report.moneyPathFrozen,
    settlementBridgeEnabled: report.settlementBridgeEnabled,
    rewardsProgramActive: report.rewardsProgramActive,
    payoutProvider: describePayoutProvider(env, report.productionRuntime),
    activationVerdict: report.verdict,
    remainingBlockers: report.remainingBlockers,
  };
}
