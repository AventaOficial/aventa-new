import { buildInfrastructureStatus } from '@/lib/owner/buildInfrastructureStatus';
import { buildOwnerDashboard } from '@/lib/owner/buildOwnerDashboard';
import {
  MAP_FLOW_DEFINITIONS,
  MAP_FLOW_LABELS,
  type AventaMapPayload,
  type MapFlowId,
  type MapFlowLive,
  type MapTone,
} from '@/lib/owner/aventaMapModel';
import { OWNER_DASHBOARD_TZ } from '@/lib/owner/mxTime';

function toneFromTraffic(status: 'green' | 'yellow' | 'red'): MapTone {
  return status;
}

function presentation(tone: MapTone): { label: string; emoji: string } {
  if (tone === 'green') return { label: 'Saludable', emoji: '🟢' };
  if (tone === 'yellow') return { label: 'Atención', emoji: '🟡' };
  if (tone === 'red') return { label: 'Riesgo', emoji: '🔴' };
  return { label: 'Estable', emoji: '⚪' };
}

function formatNum(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('es-MX');
}

function buildFlowLive(
  id: MapFlowId,
  tone: MapTone,
  signals: string[],
  healthLine: string
): MapFlowLive {
  const def = MAP_FLOW_DEFINITIONS.find((f) => f.id === id)!;
  const pres = presentation(tone);
  return {
    ...def,
    status: { label: pres.label, tone, emoji: pres.emoji },
    liveSignals: signals,
    healthLine,
  };
}

export async function buildAventaMap(): Promise<AventaMapPayload> {
  const [dashboard, infra] = await Promise.all([
    buildOwnerDashboard(),
    buildInfrastructureStatus(),
  ]);

  const flows: MapFlowLive[] = [];

  // —— Usuarios ——
  let usersTone: MapTone = 'green';
  const userSignals: string[] = [];
  if (dashboard.today.newUsers != null && dashboard.today.newUsers > 0) {
    userSignals.push(`Hoy: +${formatNum(dashboard.today.newUsers)} registros`);
  }
  if (dashboard.week.newUsers != null) {
    userSignals.push(`7 días: ${formatNum(dashboard.week.newUsers)} nuevos`);
  }
  if (dashboard.growth.retention48hPct != null) {
    userSignals.push(`Retención 48h: ${dashboard.growth.retention48hPct}%`);
  }
  if (dashboard.today.activeUsers != null) {
    userSignals.push(`Activos hoy: ${formatNum(dashboard.today.activeUsers)}`);
  }
  if (dashboard.growth.weeklyPct != null && dashboard.growth.weeklyPct < 0) {
    usersTone = 'yellow';
  }
  if (userSignals.length === 0) {
    userSignals.push('Sin señales de actividad hoy (datos limitados)');
    usersTone = 'yellow';
  }
  flows.push(
    buildFlowLive(
      'usuarios',
      usersTone,
      userSignals,
      usersTone === 'green'
        ? 'La base de usuarios alimenta votos y clics.'
        : 'Revisa captación y retención esta semana.'
    )
  );

  // —— Ofertas ——
  let offersTone: MapTone = toneFromTraffic(dashboard.summary.status);
  const offerSignals: string[] = [];
  if (dashboard.week.outbound != null) {
    offerSignals.push(`Clics a tienda (7d): ${formatNum(dashboard.week.outbound)}`);
  }
  if (dashboard.week.ctr != null) {
    offerSignals.push(`CTR semanal: ${dashboard.week.ctr}%`);
  }
  if (dashboard.week.views != null) {
    offerSignals.push(`Vistas (7d): ${formatNum(dashboard.week.views)}`);
  }
  if (dashboard.today.offersCreated != null) {
    offerSignals.push(`Ofertas creadas hoy: ${formatNum(dashboard.today.offersCreated)}`);
  }
  if (dashboard.week.ctr != null && dashboard.week.ctr < 3 && (dashboard.week.views ?? 0) > 20) {
    offersTone = 'yellow';
  }
  flows.push(
    buildFlowLive(
      'ofertas',
      offersTone,
      offerSignals,
      offersTone === 'red'
        ? 'El embudo de oferta → clic está débil o sin volumen.'
        : 'El catálogo convierte interés en salidas a tienda.'
    )
  );

  // —— Moderación ——
  let modTone: MapTone = 'green';
  const modSignals: string[] = [
    `Pendientes ahora: ${formatNum(dashboard.moderation.pending)}`,
    `Aprobadas hoy: ${formatNum(dashboard.moderation.approvedToday)}`,
  ];
  if (dashboard.moderation.pending >= 20) modTone = 'red';
  else if (dashboard.moderation.pending >= 10) modTone = 'yellow';
  if (dashboard.moderation.slaOk === false) {
    modTone = modTone === 'red' ? 'red' : 'yellow';
    modSignals.push('SLA de aprobación por encima de meta');
  } else if (dashboard.moderation.avgApprovalHours != null) {
    modSignals.push(`Tiempo medio aprobación (7d): ${dashboard.moderation.avgApprovalHours}h`);
  }
  flows.push(
    buildFlowLive(
      'moderacion',
      modTone,
      modSignals,
      modTone === 'green'
        ? 'La cola no frena el negocio.'
        : 'Prioriza moderación: retraso = menos ofertas vivas.'
    )
  );

  // —— Afiliación ——
  let affTone: MapTone = 'green';
  const affSignals: string[] = [
    `Programas activos: ${dashboard.affiliation.programsActive} de ${dashboard.affiliation.programsTotal}`,
  ];
  if (!dashboard.affiliation.mercadolibreTagConfigured) {
    affTone = 'red';
    affSignals.push('Mercado Libre: sin etiqueta configurada');
  } else {
    affSignals.push('Mercado Libre: etiqueta OK');
  }
  if (!dashboard.affiliation.amazonTagConfigured) {
    affTone = affTone === 'red' ? 'red' : 'yellow';
    affSignals.push('Amazon: sin etiqueta configurada');
  } else {
    affSignals.push('Amazon: etiqueta OK');
  }
  if (dashboard.affiliation.outboundByStore.length > 0) {
    const top = dashboard.affiliation.outboundByStore[0];
    affSignals.push(`Más clics: ${top.store} (${top.outbound})`);
  }
  flows.push(
    buildFlowLive(
      'afiliacion',
      affTone,
      affSignals,
      affTone === 'green'
        ? 'Los clics pueden generar comisión en redes activas.'
        : 'Hay tráfico pero riesgo de no monetizar cada clic.'
    )
  );

  // —— Ingresos ——
  let revTone: MapTone = 'yellow';
  const revSignals: string[] = [];
  if (dashboard.month.outbound != null) {
    revSignals.push(`Clics del mes: ${formatNum(dashboard.month.outbound)}`);
  }
  if (dashboard.month.ledgerAvailable && dashboard.month.ledgerGrossCents != null) {
    const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
      dashboard.month.ledgerGrossCents / 100
    );
    revSignals.push(`Ledger del mes: ${mxn}`);
    revTone = dashboard.month.ledgerGrossCents > 0 ? 'green' : 'yellow';
  } else {
    revSignals.push('Ledger: sin datos importados este mes');
  }
  if (dashboard.month.estimatedRevenueCents != null) {
    const est = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
      dashboard.month.estimatedRevenueCents / 100
    );
    revSignals.push(`Estimado interno: ${est}`);
  } else if (dashboard.month.estimatedNote) {
    revSignals.push(dashboard.month.estimatedNote);
  }
  revSignals.push('Comisiones a creadores: proceso manual / parcial');
  flows.push(
    buildFlowLive(
      'ingresos',
      revTone,
      revSignals,
      revTone === 'green'
        ? 'Hay ingreso registrado además de tráfico.'
        : 'Mide clics; convierte reportes de redes en ledger.'
    )
  );

  // —— Infraestructura (vista negocio) ——
  let infraTone: MapTone = 'green';
  if (infra.summary.criticalInactive.length > 0) infraTone = 'red';
  else if (infra.summary.partial > 0 || infra.summary.inactive > 4) infraTone = 'yellow';
  const infraSignals = [
    `${infra.summary.active} piezas operativas`,
    infra.summary.partial > 0 ? `${infra.summary.partial} con atención` : null,
    infra.summary.inactive > 0 ? `${infra.summary.inactive} inactivas u opcionales` : null,
    dashboard.operations.integrityOk === false
      ? 'Chequeo de integridad: falló'
      : dashboard.operations.integrityOk === true
        ? 'Integridad: OK'
        : null,
    dashboard.operations.writeQueueFailed > 20
      ? `Cola de eventos: ${dashboard.operations.writeQueueFailed} fallos`
      : null,
  ].filter((s): s is string => Boolean(s));
  flows.push(
    buildFlowLive(
      'infraestructura',
      infraTone,
      infraSignals,
      infraTone === 'green'
        ? 'La plataforma sostiene el resto de flujos.'
        : 'Revisa centro de infraestructura antes de escalar tráfico.'
    )
  );

  const links: AventaMapPayload['links'] = [];
  for (const flow of MAP_FLOW_DEFINITIONS) {
    for (const dep of flow.dependsOn) {
      links.push({
        from: dep,
        to: flow.id,
        label: `${MAP_FLOW_LABELS[dep]} → ${MAP_FLOW_LABELS[flow.id]}`,
      });
    }
  }

  const overallTone = flows.some((f) => f.status.tone === 'red')
    ? 'red'
    : flows.some((f) => f.status.tone === 'yellow')
      ? 'yellow'
      : 'green';

  return {
    generatedAt: new Date().toISOString(),
    timezone: OWNER_DASHBOARD_TZ,
    headline:
      overallTone === 'green'
        ? 'AVENTA en una sola vista'
        : overallTone === 'yellow'
          ? 'AVENTA operando con puntos de atención'
          : 'AVENTA requiere foco del fundador',
    subline: 'Seis flujos del negocio · dependencias · estado actual · impacto',
    overallTone,
    flows,
    links,
    legend: [
      { emoji: '🟢', label: 'Saludable' },
      { emoji: '🟡', label: 'Atención' },
      { emoji: '🔴', label: 'Riesgo' },
    ],
  };
}
