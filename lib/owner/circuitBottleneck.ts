/**
 * Cuello de botella del circuito Supply → Live → Click → Money.
 * Puro / determinista: el CEO dashboard solo presenta; no ejecuta acciones.
 */

export type CircuitBottleneckId =
  | 'live_starvation'
  | 'moderation_backlog'
  | 'supply_stale'
  | 'integrity'
  | 'affiliate_tags'
  | 'no_outbound'
  | 'none';

export type CircuitBottleneck = {
  id: CircuitBottleneckId;
  severity: 'green' | 'yellow' | 'red';
  problem: string;
  impact: string;
  recommendedAction: string;
  href: string;
};

export type CircuitSignals = {
  liveDeals: number | null;
  pending: number;
  pendingGt24h: number;
  oldestPendingHours: number | null;
  outbound7d: number | null;
  integrityOk: boolean | null;
  amazonTagConfigured: boolean;
  mercadolibreTagConfigured: boolean;
  /** Fuentes Hunter con last_run_at más viejo que umbral (si se midió). */
  supplyStaleSources?: number | null;
  /** Estimados de cola (sample ops); opcionales. */
  highValuePending?: number | null;
  slaBreachPending?: number | null;
};

function moderationThroughputAction(s: CircuitSignals): string {
  const hv = s.highValuePending ?? 0;
  const breach = s.slaBreachPending ?? 0;
  if (hv > 0 && breach > 0) {
    return `Priorizar ${Math.min(hv, breach)} ofertas HIGH VALUE con SLA breach.`;
  }
  if (hv > 0) {
    return `Priorizar ${hv} ofertas HIGH VALUE en cola Focus.`;
  }
  if (breach > 0) {
    return `Drenar ${breach} ofertas con SLA breach (claim → decide).`;
  }
  return 'Drenar cola Focus: claim → approve/reject/snooze';
}

const LIVE_MIN = 3;
const PENDING_RED = 20;
const PENDING_YELLOW = 10;
const AGE_RED_HOURS = 48;

/**
 * Prioridad: integridad → tags → live starvation → backlog → supply → outbound → none.
 */
export function pickCircuitBottleneck(s: CircuitSignals): CircuitBottleneck {
  if (s.integrityOk === false) {
    return {
      id: 'integrity',
      severity: 'red',
      problem: 'Chequeos de integridad del sistema fallaron',
      impact: 'Riesgo de datos inconsistentes o feed degradado',
      recommendedAction: 'Revisar integridad y corregir fallos',
      href: '/admin/operaciones',
    };
  }

  if (!s.amazonTagConfigured || !s.mercadolibreTagConfigured) {
    return {
      id: 'affiliate_tags',
      severity: 'red',
      problem: 'Tags de afiliado incompletos en entorno',
      impact: 'Clicks salen sin tracking de red → sin comisión atribuible',
      recommendedAction: 'Configurar tags Amazon y Mercado Libre',
      href: '/admin/operaciones',
    };
  }

  const live = s.liveDeals ?? 0;
  if (live < LIVE_MIN && s.pending >= 5) {
    return {
      id: 'live_starvation',
      severity: 'red',
      problem: `Solo ${live} oferta(s) live con ${s.pending} pendientes`,
      impact: 'Feed vacío/pobre → casi sin views ni outbound clicks',
      recommendedAction: moderationThroughputAction(s),
      href: '/admin/moderation',
    };
  }

  if (
    s.pending >= PENDING_RED ||
    (s.oldestPendingHours != null && s.oldestPendingHours >= AGE_RED_HOURS) ||
    s.pendingGt24h >= PENDING_YELLOW
  ) {
    return {
      id: 'moderation_backlog',
      severity: s.pending >= PENDING_RED ? 'red' : 'yellow',
      problem: `${s.pending} pendientes (${s.pendingGt24h} >24h${
        s.oldestPendingHours != null ? `; más vieja ${s.oldestPendingHours}h` : ''
      })`,
      impact: 'Supply bloqueado en review humana; tiempo-a-live alto',
      recommendedAction: moderationThroughputAction(s),
      href: '/admin/moderation',
    };
  }

  if ((s.supplyStaleSources ?? 0) > 0) {
    return {
      id: 'supply_stale',
      severity: 'yellow',
      problem: `${s.supplyStaleSources} fuente(s) Hunter stale`,
      impact: 'Menos candidatos nuevos → cola se seca después de drenar',
      recommendedAction: 'Revisar Hunter health / worker ML / cron ingest',
      href: '/admin/hunter',
    };
  }

  if (live >= LIVE_MIN && (s.outbound7d ?? 0) === 0) {
    return {
      id: 'no_outbound',
      severity: 'yellow',
      problem: 'Hay live deals pero 0 outbound clicks (7d)',
      impact: 'Sin señal de demanda; EPC/estimado NO_DATA o estancado',
      recommendedAction: 'Revisar CTA Cazar, feed ranking y tráfico',
      href: '/admin/metrics',
    };
  }

  if (s.pending >= PENDING_YELLOW) {
    return {
      id: 'moderation_backlog',
      severity: 'yellow',
      problem: `${s.pending} ofertas en cola`,
      impact: 'Riesgo de SLA >24h si no se procesa',
      recommendedAction: `Moderar ${s.pending} pendientes`,
      href: '/admin/moderation',
    };
  }

  return {
    id: 'none',
    severity: 'green',
    problem: 'Sin cuello de botella crítico detectado',
    impact: 'Circuito operable',
    recommendedAction: 'Revisar métricas semanales y supply truth',
    href: '/admin/metrics',
  };
}
