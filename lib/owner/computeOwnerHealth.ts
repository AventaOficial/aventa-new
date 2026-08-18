import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { HealthDimension } from '@/app/components/panel/HealthIndicator';

function scoreBool(ok: boolean | null | undefined, fallback = 70): number {
  if (ok === true) return 100;
  if (ok === false) return 35;
  return fallback;
}

function scoreSla(slaOk: boolean | null, pending: number): number {
  if (slaOk === true) return 95;
  if (slaOk === false) return 55;
  if (pending >= 20) return 40;
  if (pending >= 10) return 65;
  return 85;
}

function scoreAffiliation(amazon: boolean, ml: boolean): number {
  if (amazon && ml) return 100;
  if (amazon || ml) return 65;
  return 40;
}

function scoreEconomy(confidence: 'alta' | 'media' | 'baja'): number {
  if (confidence === 'alta') return 95;
  if (confidence === 'media') return 72;
  return 50;
}

function scoreOfferHealth(priceChanged: number, outOfStock: number): number {
  let s = 100;
  s -= Math.min(priceChanged * 3, 25);
  s -= Math.min(outOfStock * 5, 35);
  return Math.max(25, s);
}

function scoreOperations(integrityOk: boolean | null, writeFailed: number, writePending: number): number {
  let s = scoreBool(integrityOk, 75);
  if (writeFailed > 0) s -= 25;
  if (writePending > 50) s -= 15;
  return Math.max(20, s);
}

function scoreData(gaps: number): number {
  if (gaps === 0) return 100;
  if (gaps <= 2) return 75;
  return 50;
}

export function computeOwnerHealth(data: OwnerDashboardPayload): {
  overall: number;
  dimensions: HealthDimension[];
} {
  const dimensions: HealthDimension[] = [
    {
      id: 'infra',
      label: 'Infrastructure',
      score: scoreOperations(
        data.operations.integrityOk,
        data.operations.writeQueueFailed,
        data.operations.writeQueuePending
      ),
    },
    {
      id: 'integrations',
      label: 'Integrations',
      score: scoreAffiliation(data.affiliation.amazonTagConfigured, data.affiliation.mercadolibreTagConfigured),
    },
    {
      id: 'automations',
      label: 'Automations',
      score:
        data.operations.writeQueueFailed === 0 && data.operations.writeQueuePending < 30
          ? 92
          : data.operations.writeQueueFailed > 0
            ? 45
            : 70,
    },
    {
      id: 'moderation',
      label: 'Moderation',
      score: scoreSla(data.moderation.slaOk, data.moderation.pending),
    },
    {
      id: 'finance',
      label: 'Finance',
      score: scoreEconomy(data.economy.confidence),
    },
    {
      id: 'security',
      label: 'Security',
      score: data.operations.integrityOk === false ? 30 : data.dataGaps.length > 3 ? 60 : 90,
    },
    {
      id: 'data',
      label: 'Data',
      score: scoreData(data.dataGaps.length),
    },
  ];

  const overall = Math.round(dimensions.reduce((a, d) => a + d.score, 0) / dimensions.length);
  return { overall, dimensions };
}
