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

const COMPONENT_LABEL: Record<string, string> = {
  supabase: 'Base de datos',
  database: 'Base de datos',
  auth: 'Acceso',
  redis: 'Caché',
  cron: 'Tareas programadas',
  queue: 'Cola de escritura',
  worker: 'Cola de escritura',
  hunter: 'Hunter',
  supply: 'Hunter',
  email: 'Correo',
  affiliate: 'Afiliados',
  moderation: 'Moderación',
  attribution: 'Atribución de clics',
  price_memory: 'Historial de precios',
  deal_intelligence: 'Inteligencia de ofertas',
  money: 'Flujo de dinero',
};

function componentLabel(id: string): string {
  return COMPONENT_LABEL[id] ?? id.replace(/[_-]+/g, ' ');
}

/**
 * Aventa Health: 6 áreas con estado, razón, última actualización y CTA.
 * Reglas deterministas sobre lecturas reales; sin dato = UNKNOWN (nunca HEALTHY por defecto).
 */
export function deriveHealth(
  base: OwnerDashboardPayload | null,
  cmd: OwnerCommandPayload | null,
  todayYmd: string,
  now: number,
): HealthCategory[] {
  const out: HealthCategory[] = [];

  // PRODUCTO — plataforma: sistemas, integridad, colas y métricas diarias.
  if (!base) {
    out.push({
      id: 'PRODUCT',
      label: 'Producto',
      level: 'UNKNOWN',
      summary: 'Estado de la plataforma no disponible',
      signals: [],
      team: 'producto',
      updatedAt: null,
      href: '/admin/health',
      cta: 'Investigar',
    });
  } else {
    const map: Record<string, HealthLevel> = { healthy: 'HEALTHY', degraded: 'WARNING', blocked: 'CRITICAL', unknown: 'UNKNOWN' };
    let level = map[base.systemHealth.overall] ?? 'UNKNOWN';
    const bad = base.systemHealth.components.filter((c) => c.status !== 'healthy');
    const signals: string[] = bad.length ? bad.slice(0, 3).map((c) => `${componentLabel(c.id)}: ${c.status === 'blocked' ? 'caído' : c.status === 'degraded' ? 'degradado' : 'sin dato'}`) : ['Sistemas sin avisos'];
    let summary = level === 'HEALTHY' ? 'Plataforma estable' : level === 'UNKNOWN' ? 'Señales incompletas' : `${bad.length} sistema(s) con aviso`;
    if (base.operations.integrityOk === false) {
      level = 'CRITICAL';
      summary = 'Chequeo de integridad fallido';
      signals.unshift(`Integridad: ${base.operations.integrityFailedChecks} chequeo(s) fallidos`);
    }
    const integAge = hoursSince(cmd?.operations.integrityFinishedAt, now);
    if (integAge != null && integAge > INTEGRITY_STALE_HOURS) {
      level = worst([level, 'WARNING']);
      signals.push(`Integridad sin correr hace ${Math.round(integAge)} h`);
    }
    if (base.operations.writeQueueFailed > 0) {
      level = worst([level, 'WARNING']);
      signals.push(`${base.operations.writeQueueFailed} escrituras diferidas fallidas`);
    }
    const metricsLag = daysSinceYmd(cmd?.operations.dailyMetricsLastDate, todayYmd);
    if (metricsLag != null && metricsLag > 1) {
      level = worst([level, 'WARNING']);
      signals.push(`Métricas diarias atrasadas ${metricsLag} d`);
    }
    out.push({
      id: 'PRODUCT',
      label: 'Producto',
      level,
      summary,
      signals: signals.slice(0, 4),
      team: 'producto',
      updatedAt: cmd?.operations.integrityFinishedAt ?? base.generatedAt,
      href: '/admin/health',
      cta: 'Investigar',
    });
  }

  // COMUNIDAD — reportes pendientes y participación del período.
  if (!cmd || cmd.sources.community === 'error') {
    out.push({
      id: 'COMMUNITY',
      label: 'Comunidad',
      level: 'UNKNOWN',
      summary: 'Actividad de comunidad no disponible',
      signals: [],
      team: 'comunidad',
      updatedAt: cmd?.generatedAt ?? null,
      href: '/admin/moderation/reports',
      cta: 'Investigar',
    });
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
      signals: [`${engagement.toLocaleString('es-MX')} interacciones`, `${reports ?? '—'} reportes pendientes`],
      team: 'comunidad',
      updatedAt: cmd.generatedAt,
      href: reports ? '/admin/moderation/reports' : '/plaza',
      cta: 'Investigar',
    });
  }

  // CATÁLOGO — ofertas live, cola de moderación, stock y expiradas.
  if (!base) {
    out.push({
      id: 'CATALOG',
      label: 'Catálogo',
      level: 'UNKNOWN',
      summary: 'Estado del catálogo no disponible',
      signals: [],
      team: 'moderacion',
      updatedAt: null,
      href: '/admin/moderation',
      cta: 'Investigar',
    });
  } else {
    const live = base.liveDeals;
    const m = base.moderation;
    const signals: string[] = [`${live ?? '—'} ofertas live`, `${m.pending} en cola`];
    let level: HealthLevel = 'HEALTHY';
    let summary = 'Catálogo operando';
    if (live == null) {
      level = 'UNKNOWN';
      summary = 'Ofertas live sin dato';
    } else if (live === 0) {
      level = 'CRITICAL';
      summary = 'Feed sin ofertas live';
    } else if (live < 3) {
      level = 'WARNING';
      summary = 'Muy pocas ofertas live';
    }
    if (m.pending >= 20 || m.pendingGt24h >= 10) {
      level = worst([level, 'CRITICAL']);
      summary = level === 'CRITICAL' && live !== 0 ? 'Cola de moderación desbordada' : summary;
    } else if (m.pending >= 10 || m.pendingGt24h > 0) {
      level = worst([level, 'WARNING']);
      if (summary === 'Catálogo operando') summary = 'Cola de moderación con atraso';
    }
    if (m.pendingGt24h > 0) signals.push(`${m.pendingGt24h} con más de 24 h`);
    if (base.offerHealth.tableAvailable && base.offerHealth.outOfStock > 0) {
      level = worst([level, 'WARNING']);
      signals.push(`${base.offerHealth.outOfStock} agotadas`);
    }
    if (cmd?.catalog.expired != null && cmd.catalog.expired > 0) signals.push(`${cmd.catalog.expired} expiradas sin archivar`);
    out.push({
      id: 'CATALOG',
      label: 'Catálogo',
      level,
      summary,
      signals: signals.slice(0, 4),
      team: 'moderacion',
      updatedAt: base.generatedAt,
      href: '/admin/moderation',
      cta: 'Investigar',
    });
  }

  // HUNTER — supply automático: frescura de runs y errores.
  if (!cmd || cmd.sources.hunter === 'error') {
    out.push({
      id: 'HUNTER',
      label: 'Hunter',
      level: 'UNKNOWN',
      summary: 'Estado de Hunter no disponible',
      signals: [],
      team: 'hunter',
      updatedAt: null,
      href: '/admin/hunter',
      cta: 'Investigar',
    });
  } else {
    const h = cmd.hunter;
    const age = hoursSince(h.lastRunAt, now);
    let level: HealthLevel = 'HEALTHY';
    let summary = 'Hunter corriendo';
    if (age == null) {
      level = 'WARNING';
      summary = 'Sin runs registrados';
    } else if (age > HUNTER_STALE_HOURS) {
      level = 'WARNING';
      summary = `Sin runs hace ${Math.round(age)} h`;
    }
    if ((h.errors ?? 0) > 0) {
      level = worst([level, 'WARNING']);
      if (summary === 'Hunter corriendo') summary = 'Runs con errores';
    }
    const signals = [
      `${h.runs ?? '—'} runs en el período`,
      `${h.verified ?? '—'} verificadas`,
      ...(h.errors ? [`${h.errors} errores`] : []),
    ];
    out.push({
      id: 'HUNTER',
      label: 'Hunter',
      level,
      summary,
      signals,
      team: 'hunter',
      updatedAt: h.lastRunAt,
      href: '/admin/hunter',
      cta: 'Investigar',
    });
  }

  // GROWTH — altas nuevas vs período anterior equivalente.
  if (!cmd || cmd.users.newUsers.value == null) {
    out.push({
      id: 'GROWTH',
      label: 'Growth',
      level: 'UNKNOWN',
      summary: 'Altas del período no disponibles',
      signals: [],
      team: 'growth',
      updatedAt: cmd?.generatedAt ?? null,
      href: '/admin/owner/crecimiento',
      cta: 'Investigar',
    });
  } else {
    const { value, previous } = cmd.users.newUsers;
    let level: HealthLevel = 'HEALTHY';
    let summary = 'Altas estables o en aumento';
    if (value === 0 && (previous ?? 0) === 0) {
      level = 'WARNING';
      summary = 'Sin altas en ambos períodos';
    } else if (previous != null && previous > 0 && value != null && value < previous * 0.7) {
      level = 'WARNING';
      summary = 'Altas cayendo más de 30%';
    }
    out.push({
      id: 'GROWTH',
      label: 'Growth',
      level,
      summary,
      signals: [`${value} altas`, `antes ${previous ?? '—'}`, `${cmd.traffic.outbound.value ?? '—'} clics a tienda`],
      team: 'growth',
      updatedAt: cmd.generatedAt,
      href: '/admin/owner/crecimiento',
      cta: 'Investigar',
    });
  }

  // MONETIZACIÓN — nunca se evalúa como dinero real si el money path está congelado.
  if (!base) {
    out.push({
      id: 'MONETIZATION',
      label: 'Monetización',
      level: 'UNKNOWN',
      summary: 'Estado de monetización no disponible',
      signals: [],
      team: 'finanzas',
      updatedAt: null,
      href: '/equipo/contabilidad',
      cta: 'Ver finanzas',
    });
  } else if (base.systemHealth.moneyPathFrozen) {
    out.push({
      id: 'MONETIZATION',
      label: 'Monetización',
      level: 'FROZEN',
      summary: 'Frozen — Money path protegido',
      signals: [
        `Tags Amazon ${base.affiliation.amazonTagConfigured ? 'OK' : 'faltan'} · ML ${base.affiliation.mercadolibreTagConfigured ? 'OK' : 'faltan'}`,
        'Pagos congelados: solo lectura',
      ],
      team: 'finanzas',
      updatedAt: base.generatedAt,
      href: '/equipo/contabilidad',
      cta: 'Ver (solo lectura)',
    });
  } else {
    const tagsOk = base.affiliation.amazonTagConfigured && base.affiliation.mercadolibreTagConfigured;
    const level: HealthLevel = !tagsOk ? 'CRITICAL' : base.attribution.status === 'blocked' ? 'CRITICAL' : base.attribution.status === 'degraded' ? 'WARNING' : 'HEALTHY';
    out.push({
      id: 'MONETIZATION',
      label: 'Monetización',
      level,
      summary: tagsOk ? (level === 'HEALTHY' ? 'Atribución completa' : 'Atribución incompleta') : 'Tags de afiliado incompletos',
      signals: [`Programas activos ${base.affiliation.programsActive}/${base.affiliation.programsTotal}`],
      team: 'finanzas',
      updatedAt: base.generatedAt,
      href: '/equipo/contabilidad',
      cta: 'Ver finanzas',
    });
  }

  return out;
}

const SEVERITY_RANK: Record<PrioritySeverity, number> = { critical: 0, high: 1, medium: 2, info: 3 };

/**
 * Prioridades del CEO: reglas deterministas sobre señales reales (sin IA).
 * Solo aparecen si la condición existe. Orden: severidad y luego cantidad.
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
        reason: `${base.operations.integrityFailedChecks} chequeo(s) del último análisis de integridad fallaron.`,
        impact: 'Datos inconsistentes pueden llegar al feed o a las métricas.',
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
        reason: `Solo ${base.liveDeals ?? 0} ofertas live en el feed.`,
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
        reason: `${m.pendingGt24h} oferta(s) superan el SLA de ${m.slaHoursTarget} h${m.oldestPendingHours != null ? `; la más vieja lleva ${m.oldestPendingHours} h` : ''}.`,
        impact: 'Ofertas que caducan antes de publicarse y cazadores sin respuesta.',
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
        reason: `${m.pending} ofertas esperan decisión.`,
        impact: 'Ofertas listas que el usuario todavía no ve.',
        quantity: m.pending,
        action: 'Moderar',
        href: '/admin/moderation',
        provenance: 'REAL',
      });
    }
    if (!base.affiliation.amazonTagConfigured || !base.affiliation.mercadolibreTagConfigured) {
      const missing = [!base.affiliation.amazonTagConfigured ? 'Amazon' : null, !base.affiliation.mercadolibreTagConfigured ? 'Mercado Libre' : null].filter(Boolean).join(' y ');
      push({
        id: 'affiliate_tags',
        severity: 'high',
        team: 'finanzas',
        problem: 'Tags de afiliado incompletos',
        reason: `Falta configurar el tag de ${missing}.`,
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
        problem: 'Escrituras diferidas fallidas',
        reason: `${base.operations.writeQueueFailed} escritura(s) diferidas no se aplicaron.`,
        impact: 'Votos o eventos que no quedaron registrados.',
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
        reason: `Completitud de atribución ${base.attribution.completenessPct}% en las últimas 24 h.`,
        impact: 'Comisiones que no se podrán asignar a su cazador.',
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
        reason: `${base.offerHealth.outOfStock} oferta(s) live aparecen sin stock en el último escaneo.`,
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
        problem: 'Chequeo de integridad sin ejecutarse',
        reason: `Último resultado hace ${Math.round(integAge)} h; se espera a diario.`,
        impact: 'Problemas de datos pueden pasar sin detectarse.',
        quantity: null,
        action: 'Investigar',
        href: '/admin/operaciones',
        provenance: 'CALCULATED',
      });
    }
    const metricsLag = daysSinceYmd(cmd.operations.dailyMetricsLastDate, todayYmd);
    if (metricsLag != null && metricsLag > 1) {
      push({
        id: 'daily_metrics_stale',
        severity: 'medium',
        team: 'operaciones',
        problem: 'Métricas diarias atrasadas',
        reason: `Las métricas diarias no se actualizan desde ${cmd.operations.dailyMetricsLastDate}.`,
        impact: 'Reportes históricos y tendencias incompletos.',
        quantity: metricsLag,
        action: 'Investigar',
        href: '/admin/operaciones',
        provenance: 'CALCULATED',
      });
    }
    const pr = cmd.moderation.pendingReports;
    if (pr != null && pr > 0) {
      push({
        id: 'pending_reports',
        severity: pr >= 10 ? 'high' : 'medium',
        team: 'moderacion',
        problem: 'Reportes de comunidad sin revisar',
        reason: `${pr} reporte(s) de usuarios esperan revisión.`,
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
        reason: hunterAge == null ? 'No hay runs terminados registrados.' : `Último run hace ${Math.round(hunterAge)} h (umbral ${HUNTER_STALE_HOURS} h).`,
        impact: 'Menos ofertas nuevas entrando al catálogo.',
        quantity: null,
        action: 'Ver Hunter',
        href: '/admin/hunter',
        provenance: 'CALCULATED',
      });
    }
    if (cmd.hunter.errors != null && cmd.hunter.errors > 0) {
      push({
        id: 'hunter_errors',
        severity: 'medium',
        team: 'hunter',
        problem: 'Errores en runs de Hunter',
        reason: `${cmd.hunter.errors} error(es) en runs del período (${cmd.range.label.toLowerCase()}).`,
        impact: 'Candidatas que se pierden antes de llegar a moderación.',
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
        severity: 'info',
        team: 'comunidad',
        problem: 'Solicitudes de Plaza pendientes',
        reason: `${plaza} solicitud(es) de la comunidad esperan moderación.`,
        impact: 'Quedan invisibles para la comunidad mientras no se revisen (Plaza aún no tiene cola propia en moderación).',
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

/** Checklist CALCULATED (no se persiste): metas del día a partir de señales reales. */
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
      rule: 'Hecha cuando no quedan ofertas pendientes de moderar.',
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
      rule: 'Aprobadas hoy (hora MX) contra la meta diaria del tablero de equipo.',
    });
    goals.push({
      id: 'integrity',
      label: 'Integridad del sistema en verde',
      current: base.operations.integrityOk == null ? null : base.operations.integrityOk ? 1 : 0,
      target: 1,
      done: base.operations.integrityOk,
      href: '/admin/operaciones',
      rule: 'Último chequeo de integridad sin fallos.',
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
      rule: 'Hecha cuando no quedan reportes pendientes.',
    });
    const plaza = cmd.plaza.pendingRequests;
    goals.push({
      id: 'plaza',
      label: `Responder solicitudes de Plaza (${plaza ?? '—'})`,
      current: plaza,
      target: 0,
      done: plaza == null ? null : plaza === 0,
      href: '/plaza',
      rule: 'Hecha cuando no quedan solicitudes de Plaza pendientes.',
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
  if (dataMissing) return { level: 'UNKNOWN', reason: 'Datos del equipo no disponibles' };
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
