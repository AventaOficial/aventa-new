import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { GerenciaPayload } from '@/lib/staff/buildStaffHome';
import type { CeoPriority, DerivedGoal, HealthCategory, HealthLevel, PrioritySeverity, TeamId } from './types';

const HOUR_MS = 3_600_000;

export function hoursSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (now - t) / HOUR_MS : null;
}

/** Días civiles entre `ymd` (YYYY-MM-DD) y hoy MX; null si no hay fecha. */
export function daysSinceYmd(ymd: string | null | undefined, todayYmd: string): number | null {
  if (!ymd) return null;
  const a = Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
  const b = Date.UTC(Number(todayYmd.slice(0, 4)), Number(todayYmd.slice(5, 7)) - 1, Number(todayYmd.slice(8, 10)));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

const RANK: Record<HealthLevel, number> = { HEALTHY: 0, FROZEN: 0, UNKNOWN: 1, WARNING: 2, CRITICAL: 3 };

function worst(levels: HealthLevel[]): HealthLevel {
  return levels.reduce<HealthLevel>((acc, l) => (RANK[l] > RANK[acc] ? l : acc), 'HEALTHY');
}

/** Umbral: el cron de integridad corre a diario; >26 h sin resultado = atrasado. */
export const INTEGRITY_STALE_HOURS = 26;
/** Umbral: Hunter sin runs terminados en 6 h = pipeline parado. */
export const HUNTER_STALE_HOURS = 6;

export function deriveHealth(
  base: OwnerDashboardPayload | null,
  cmd: OwnerCommandPayload | null,
  todayYmd: string,
  now: number,
): HealthCategory[] {
  const out: HealthCategory[] = [];

  // PRODUCT — catálogo vivo y calidad de ofertas.
  if (!base) {
    out.push({ id: 'PRODUCT', label: 'Producto', level: 'UNKNOWN', summary: 'Sin snapshot del catálogo', signals: [], team: 'producto' });
  } else {
    const live = base.liveDeals;
    const signals: string[] = [];
    let level: HealthLevel = 'HEALTHY';
    if (live == null) level = 'UNKNOWN';
    else if (live === 0) level = 'CRITICAL';
    else if (live < 3) level = 'WARNING';
    signals.push(`${live ?? '—'} ofertas live`);
    if (base.offerHealth.tableAvailable) {
      if (base.offerHealth.outOfStock > 0) {
        level = worst([level, 'WARNING']);
        signals.push(`${base.offerHealth.outOfStock} agotadas`);
      }
      if (base.offerHealth.priceChanged > 0) signals.push(`${base.offerHealth.priceChanged} con precio cambiado`);
    } else {
      signals.push('offer_health_state no disponible');
    }
    if (cmd?.catalog.expired != null && cmd.catalog.expired > 0) signals.push(`${cmd.catalog.expired} expiradas sin archivar`);
    out.push({
      id: 'PRODUCT',
      label: 'Producto',
      level,
      summary: level === 'CRITICAL' ? 'Feed sin ofertas live' : level === 'WARNING' ? 'Catálogo con avisos' : level === 'UNKNOWN' ? 'Catálogo sin dato' : 'Catálogo operando',
      signals,
      team: 'producto',
    });
  }

  // OPERATIONS — moderación, integridad y colas.
  if (!base) {
    out.push({ id: 'OPERATIONS', label: 'Operaciones', level: 'UNKNOWN', summary: 'Sin snapshot operativo', signals: [], team: 'operaciones' });
  } else {
    const m = base.moderation;
    const signals = [`${m.pending} pendientes`, `${m.pendingGt24h} >24 h`];
    let level: HealthLevel = 'HEALTHY';
    if (m.pending >= 20 || m.pendingGt24h >= 10) level = 'CRITICAL';
    else if (m.pending >= 10 || m.pendingGt24h > 0) level = 'WARNING';
    if (base.operations.integrityOk === false) {
      level = 'CRITICAL';
      signals.push(`integridad: ${base.operations.integrityFailedChecks} fallos`);
    }
    const integAge = hoursSince(cmd?.operations.integrityFinishedAt, now);
    if (integAge != null && integAge > INTEGRITY_STALE_HOURS) {
      level = worst([level, 'WARNING']);
      signals.push(`integridad hace ${Math.round(integAge)} h`);
    }
    if (base.operations.writeQueueFailed > 0) {
      level = worst([level, 'WARNING']);
      signals.push(`${base.operations.writeQueueFailed} jobs fallidos`);
    }
    out.push({
      id: 'OPERATIONS',
      label: 'Operaciones',
      level,
      summary: level === 'CRITICAL' ? 'Requiere acción hoy' : level === 'WARNING' ? 'Atención en colas' : 'Colas bajo control',
      signals,
      team: 'operaciones',
    });
  }

  // COMMUNITY — reportes y participación del período.
  if (!cmd || cmd.sources.community === 'error') {
    out.push({ id: 'COMMUNITY', label: 'Comunidad', level: 'UNKNOWN', summary: 'Sin datos de comunidad', signals: [], team: 'comunidad' });
  } else {
    const c = cmd.community;
    const engagement = [c.votes.value, c.comments.value, c.favorites.value].reduce<number>((a, v) => a + (v ?? 0), 0);
    const reports = cmd.moderation.pendingReports;
    let level: HealthLevel = 'HEALTHY';
    if (reports != null && reports >= 10) level = 'CRITICAL';
    else if (reports != null && reports > 0) level = 'WARNING';
    if (engagement === 0) level = worst([level, 'WARNING']);
    out.push({
      id: 'COMMUNITY',
      label: 'Comunidad',
      level,
      summary: engagement === 0 ? 'Sin interacción en el período' : reports ? 'Reportes por revisar' : 'Comunidad activa',
      signals: [`${engagement} interacciones`, `${reports ?? '—'} reportes pendientes`],
      team: 'comunidad',
    });
  }

  // MONETIZATION — nunca se evalúa como dinero real si el money path está congelado.
  if (!base) {
    out.push({ id: 'MONETIZATION', label: 'Monetización', level: 'UNKNOWN', summary: 'Sin snapshot', signals: [], team: 'finanzas' });
  } else if (base.systemHealth.moneyPathFrozen) {
    out.push({
      id: 'MONETIZATION',
      label: 'Monetización',
      level: 'FROZEN',
      summary: 'Frozen — Money path protegido',
      signals: [
        `tags Amazon ${base.affiliation.amazonTagConfigured ? 'OK' : 'faltan'} · ML ${base.affiliation.mercadolibreTagConfigured ? 'OK' : 'faltan'}`,
        `atribución ${base.attribution.status}`,
      ],
      team: 'finanzas',
    });
  } else {
    const tagsOk = base.affiliation.amazonTagConfigured && base.affiliation.mercadolibreTagConfigured;
    const level: HealthLevel = !tagsOk ? 'CRITICAL' : base.attribution.status === 'blocked' ? 'CRITICAL' : base.attribution.status === 'degraded' ? 'WARNING' : 'HEALTHY';
    out.push({
      id: 'MONETIZATION',
      label: 'Monetización',
      level,
      summary: tagsOk ? `Atribución ${base.attribution.status}` : 'Tags de afiliado incompletos',
      signals: [`programas ${base.affiliation.programsActive}/${base.affiliation.programsTotal}`],
      team: 'finanzas',
    });
  }

  // INFRASTRUCTURE — system health agregado + crons observables.
  if (!base) {
    out.push({ id: 'INFRASTRUCTURE', label: 'Infraestructura', level: 'UNKNOWN', summary: 'Sin system health', signals: [], team: 'operaciones' });
  } else {
    const map: Record<string, HealthLevel> = { healthy: 'HEALTHY', degraded: 'WARNING', blocked: 'CRITICAL', unknown: 'UNKNOWN' };
    let level = map[base.systemHealth.overall] ?? 'UNKNOWN';
    const bad = base.systemHealth.components.filter((c) => c.status !== 'healthy');
    const signals = bad.length ? bad.map((c) => `${c.id}: ${c.status}`) : ['todos los componentes healthy'];
    const metricsLag = daysSinceYmd(cmd?.operations.dailyMetricsLastDate, todayYmd);
    if (metricsLag != null && metricsLag > 1) {
      level = worst([level, 'WARNING']);
      signals.push(`daily_system_metrics atrasado ${metricsLag} d`);
    }
    out.push({
      id: 'INFRASTRUCTURE',
      label: 'Infraestructura',
      level,
      summary: level === 'HEALTHY' ? 'Sistemas estables' : level === 'UNKNOWN' ? 'Señales incompletas' : `${bad.length} componente(s) con aviso`,
      signals: signals.slice(0, 4),
      team: 'producto',
    });
  }

  // GROWTH — altas nuevas vs período anterior equivalente.
  if (!cmd || cmd.users.newUsers.value == null) {
    out.push({ id: 'GROWTH', label: 'Growth', level: 'UNKNOWN', summary: 'Sin datos de altas', signals: [], team: 'growth' });
  } else {
    const { value, previous } = cmd.users.newUsers;
    let level: HealthLevel = 'HEALTHY';
    let summary = 'Altas estables o en aumento';
    if (value === 0 && (previous ?? 0) === 0) {
      level = 'WARNING';
      summary = 'Sin altas en ambos períodos';
    } else if (previous != null && previous > 0 && value != null && value < previous * 0.7) {
      level = 'WARNING';
      summary = 'Altas cayendo >30%';
    }
    out.push({
      id: 'GROWTH',
      label: 'Growth',
      level,
      summary,
      signals: [`${value} altas`, `antes ${previous ?? '—'}`, `${cmd.traffic.outbound.value ?? '—'} clics`],
      team: 'growth',
    });
  }

  return out;
}

const SEVERITY_RANK: Record<PrioritySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Prioridades del CEO: reglas deterministas sobre señales reales (sin IA).
 * Orden: severidad y luego cantidad.
 */
export function derivePriorities(
  base: OwnerDashboardPayload | null,
  cmd: OwnerCommandPayload | null,
  todayYmd: string,
  now: number,
): CeoPriority[] {
  const list: CeoPriority[] = [];
  const push = (p: CeoPriority) => list.push(p);

  if (base) {
    const m = base.moderation;
    if (base.operations.integrityOk === false) {
      push({
        id: 'integrity',
        severity: 'critical',
        team: 'operaciones',
        problem: 'Chequeo de integridad fallido',
        impact: 'Datos inconsistentes pueden llegar al feed o a métricas.',
        quantity: base.operations.integrityFailedChecks,
        action: 'Revisar',
        href: '/admin/operaciones',
        provenance: 'REAL',
      });
    }
    if (base.circuitBottleneck.id === 'live_starvation') {
      push({
        id: 'live_starvation',
        severity: 'critical',
        team: 'moderacion',
        problem: base.circuitBottleneck.problem,
        impact: base.circuitBottleneck.impact,
        quantity: base.liveDeals,
        action: 'Moderar',
        href: base.circuitBottleneck.href,
        provenance: 'REAL',
      });
    }
    if (m.pendingGt24h > 0) {
      push({
        id: 'pending_sla',
        severity: m.pendingGt24h >= 10 ? 'critical' : 'high',
        team: 'moderacion',
        problem: 'Ofertas pendientes más de 24 h',
        impact: `SLA de ${m.slaHoursTarget} h roto${m.oldestPendingHours != null ? ` · la más vieja lleva ${m.oldestPendingHours} h` : ''}.`,
        quantity: m.pendingGt24h,
        action: 'Revisar',
        href: '/admin/moderation',
        provenance: 'REAL',
      });
    } else if (m.pending >= 10) {
      push({
        id: 'pending_queue',
        severity: m.pending >= 20 ? 'high' : 'medium',
        team: 'moderacion',
        problem: 'Cola de moderación alta',
        impact: 'Ofertas listas esperando decisión humana.',
        quantity: m.pending,
        action: 'Moderar',
        href: '/admin/moderation',
        provenance: 'REAL',
      });
    }
    if (!base.affiliation.amazonTagConfigured || !base.affiliation.mercadolibreTagConfigured) {
      push({
        id: 'affiliate_tags',
        severity: 'high',
        team: 'finanzas',
        problem: 'Tags de afiliado incompletos',
        impact: 'Clics salientes sin tag no generan comisión atribuible.',
        quantity: null,
        action: 'Revisar',
        href: '/admin/operaciones',
        provenance: 'REAL',
      });
    }
    if (base.operations.writeQueueFailed > 0) {
      push({
        id: 'write_queue_failed',
        severity: base.operations.writeQueueFailed > 20 ? 'high' : 'medium',
        team: 'operaciones',
        problem: 'Jobs de escritura fallidos',
        impact: 'Escrituras diferidas (votos, eventos) que no se aplicaron.',
        quantity: base.operations.writeQueueFailed,
        action: 'Investigar',
        href: '/admin/operaciones',
        provenance: 'REAL',
      });
    }
    const gap = base.attribution.attributionGap;
    if (gap != null && gap > 0 && base.attribution.completenessPct != null && base.attribution.completenessPct < 90) {
      push({
        id: 'attribution_gap',
        severity: 'medium',
        team: 'finanzas',
        problem: 'Clics sin atribución completa (24 h)',
        impact: `Completitud ${base.attribution.completenessPct}% en reward_outbound_clicks.`,
        quantity: gap,
        action: 'Revisar',
        href: '/admin/health',
        provenance: 'REAL',
      });
    }
    if (base.offerHealth.tableAvailable && base.offerHealth.outOfStock > 0) {
      push({
        id: 'out_of_stock',
        severity: 'medium',
        team: 'producto',
        problem: 'Ofertas live agotadas',
        impact: 'Usuarios llegan a tiendas sin stock: erosiona confianza.',
        quantity: base.offerHealth.outOfStock,
        action: 'Revisar',
        href: '/equipo/operaciones/agotadas',
        provenance: 'REAL',
      });
    }
  }

  if (cmd) {
    const integAge = hoursSince(cmd.operations.integrityFinishedAt, now);
    if (integAge != null && integAge > INTEGRITY_STALE_HOURS) {
      push({
        id: 'integrity_stale',
        severity: 'medium',
        team: 'operaciones',
        problem: 'Cron de integridad sin ejecutarse',
        impact: `Último resultado hace ${Math.round(integAge)} h (esperado diario).`,
        quantity: null,
        action: 'Investigar',
        href: '/admin/operaciones',
        provenance: 'DERIVED',
      });
    }
    const metricsLag = daysSinceYmd(cmd.operations.dailyMetricsLastDate, todayYmd);
    if (metricsLag != null && metricsLag > 1) {
      push({
        id: 'daily_metrics_stale',
        severity: 'medium',
        team: 'operaciones',
        problem: 'Métricas diarias atrasadas',
        impact: `daily_system_metrics no se actualiza desde ${cmd.operations.dailyMetricsLastDate}.`,
        quantity: metricsLag,
        action: 'Investigar',
        href: '/admin/operaciones',
        provenance: 'DERIVED',
      });
    }
    const pr = cmd.moderation.pendingReports;
    if (pr != null && pr > 0) {
      push({
        id: 'pending_reports',
        severity: pr >= 10 ? 'high' : 'medium',
        team: 'moderacion',
        problem: 'Reportes de comunidad sin revisar',
        impact: 'Contenido señalado sigue visible hasta que se revise.',
        quantity: pr,
        action: 'Revisar',
        href: '/admin/moderation/reports',
        provenance: 'REAL',
      });
    }
    const hunterAge = hoursSince(cmd.hunter.lastRunAt, now);
    if (cmd.sources.hunter === 'ok' && (hunterAge == null || hunterAge > HUNTER_STALE_HOURS)) {
      push({
        id: 'hunter_stale',
        severity: 'medium',
        team: 'hunter',
        problem: 'Hunter sin runs recientes',
        impact: hunterAge == null ? 'No hay runs terminados registrados.' : `Último run hace ${Math.round(hunterAge)} h.`,
        quantity: null,
        action: 'Ver Hunter',
        href: '/admin/hunter',
        provenance: 'DERIVED',
      });
    }
    if (cmd.hunter.errors != null && cmd.hunter.errors > 0) {
      push({
        id: 'hunter_errors',
        severity: 'medium',
        team: 'hunter',
        problem: 'Errores en runs de Hunter',
        impact: `En el período: ${cmd.range.label.toLowerCase()}.`,
        quantity: cmd.hunter.errors,
        action: 'Ver Hunter',
        href: '/admin/hunter',
        provenance: 'REAL',
      });
    }
    const plaza = cmd.plaza.pendingRequests;
    if (plaza != null && plaza > 0) {
      push({
        id: 'plaza_pending',
        severity: 'low',
        team: 'comunidad',
        problem: 'Solicitudes de Plaza pendientes de moderación',
        impact: 'No hay cola admin dedicada en esta rama; quedan invisibles para la comunidad.',
        quantity: plaza,
        action: 'Ver Plaza',
        href: '/plaza',
        provenance: 'REAL',
      });
    }
  }

  return list.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (b.quantity ?? 0) - (a.quantity ?? 0),
  );
}

/** Checklist DERIVED (no se persiste): metas del día a partir de señales reales. */
export function deriveGoals(
  base: OwnerDashboardPayload | null,
  cmd: OwnerCommandPayload | null,
  gerencia: GerenciaPayload | null,
): DerivedGoal[] {
  const goals: DerivedGoal[] = [];
  if (base) {
    goals.push({
      id: 'moderation_queue',
      label: `Vaciar cola de moderación (${base.moderation.pending} pendientes)`,
      current: base.moderation.pending,
      target: 0,
      done: base.moderation.pending === 0,
      href: '/admin/moderation',
      rule: 'Hecha cuando offers.status = pending es 0.',
    });
    const liveTarget = gerencia?.sla.liveTarget ?? null;
    const approvedToday = base.moderation.approvedToday;
    goals.push({
      id: 'approved_today',
      label: liveTarget != null ? `Meta diaria de aprobadas (${liveTarget})` : 'Meta diaria de aprobadas',
      current: approvedToday,
      target: liveTarget,
      done: approvedToday != null && liveTarget != null ? approvedToday >= liveTarget : null,
      href: '/admin/moderation',
      rule: 'moderation_logs approved hoy (MX) vs meta TEAM_DAILY_LIVE_TARGET del tablero de equipo.',
    });
    goals.push({
      id: 'integrity',
      label: 'Integridad del sistema en verde',
      current: base.operations.integrityOk == null ? null : base.operations.integrityOk ? 1 : 0,
      target: 1,
      done: base.operations.integrityOk,
      href: '/admin/operaciones',
      rule: 'app_config.system_integrity_last.ok.',
    });
  }
  if (cmd) {
    const pr = cmd.moderation.pendingReports;
    goals.push({
      id: 'reports',
      label: `Cerrar reportes abiertos (${pr ?? '—'})`,
      current: pr,
      target: 0,
      done: pr == null ? null : pr === 0,
      href: '/admin/moderation/reports',
      rule: 'offer_reports.status = pending es 0.',
    });
    const plaza = cmd.plaza.pendingRequests;
    goals.push({
      id: 'plaza',
      label: `Responder solicitudes de Plaza (${plaza ?? '—'})`,
      current: plaza,
      target: 0,
      done: plaza == null ? null : plaza === 0,
      href: '/plaza',
      rule: 'plaza_requests.status = pending es 0.',
    });
  }
  return goals;
}

export type TeamStatus = { level: HealthLevel; reason: string };

export function teamStatusFromHealth(
  team: TeamId,
  health: HealthCategory[],
  priorities: CeoPriority[],
  dataMissing = false,
): TeamStatus {
  if (dataMissing) return { level: 'UNKNOWN', reason: 'Fuente de datos no disponible' };
  const own = priorities.filter((p) => p.team === team);
  if (own.some((p) => p.severity === 'critical')) return { level: 'CRITICAL', reason: own[0].problem };
  if (own.some((p) => p.severity === 'high' || p.severity === 'medium')) return { level: 'WARNING', reason: own[0].problem };
  const cats = health.filter((h) => h.team === team);
  if (cats.length) {
    const lvl = worst(cats.map((c) => c.level));
    const frozen = cats.every((c) => c.level === 'FROZEN');
    return { level: frozen ? 'FROZEN' : lvl, reason: cats[0].summary };
  }
  if (own.length) return { level: 'HEALTHY', reason: own[0].problem };
  return { level: 'HEALTHY', reason: 'Sin alertas activas' };
}
