import type { OwnerDashboardPayload } from '@/lib/owner/buildOwnerDashboard';
import { formatDiff } from '@/lib/owner/buildOwnerDashboard';

export type IntelligenceInsight = {
  text: string;
};

export type IntelligenceAction = {
  label: string;
  href: string;
  priority: 'alta' | 'media' | 'baja';
};

export function buildIntelligenceFromData(data: OwnerDashboardPayload): {
  insights: IntelligenceInsight[];
  actions: IntelligenceAction[];
  hasEnoughData: boolean;
} {
  const insights: IntelligenceInsight[] = [];
  const actions: IntelligenceAction[] = [];

  const outboundDiff = formatDiff(data.week.outbound, data.today.outbound != null ? data.today.outbound * 7 : null);
  if (data.week.outbound != null && data.week.outbound > 0) {
    insights.push({
      text: `Clics afiliados esta semana: ${data.week.outbound.toLocaleString('es-MX')}${outboundDiff.label ? ` (${outboundDiff.label} vs referencia)` : ''}.`,
    });
  }

  if (data.growth.weeklyPct != null) {
    insights.push({
      text: `Registros crecieron ${data.growth.weeklyPct >= 0 ? '+' : ''}${data.growth.weeklyPct}% en los últimos 7 días.`,
    });
  }

  if (data.week.topCategories.length > 0) {
    const top = data.week.topCategories[0];
    const total = data.week.topCategories.reduce((s, c) => s + c.outbound, 0);
    const pct = total > 0 ? Math.round((top.outbound / total) * 100) : null;
    if (pct != null) {
      insights.push({
        text: `${top.category} genera ${pct}% de los clics por categoría esta semana.`,
      });
    }
  }

  if (data.affiliation.outboundByStore.length > 0) {
    const topStore = data.affiliation.outboundByStore[0];
    insights.push({
      text: `${topStore.store} lidera clics esta semana con ${topStore.outbound.toLocaleString('es-MX')}.`,
    });
  }

  for (const alert of data.alerts.slice(0, 2)) {
    insights.push({ text: alert.title });
  }

  if (data.offerHealth.priceChanged > 0) {
    insights.push({
      text: `${data.offerHealth.priceChanged} ofertas con cambio de precio detectado.`,
    });
  }

  if (data.recommendedAction.title) {
    actions.push({
      label: data.recommendedAction.title,
      href: data.recommendedAction.href,
      priority: data.alerts.some((a) => a.severity === 'red') ? 'alta' : 'media',
    });
  }

  if (data.offerHealth.priceChanged >= 3) {
    actions.push({
      label: 'Revisar ofertas con precio cambiado',
      href: '/admin/health',
      priority: 'media',
    });
  }

  if (data.moderation.pending >= 15) {
    actions.push({
      label: 'Supervisar backlog de moderación',
      href: '/equipo/gerencia',
      priority: data.moderation.pending >= 25 ? 'alta' : 'media',
    });
  }

  if (data.growth.weeklyPct != null && data.growth.weeklyPct > 10 && data.week.topCategories[0]) {
    actions.push({
      label: `Escalar contenido de ${data.week.topCategories[0].category}`,
      href: '/equipo/marketing',
      priority: 'baja',
    });
  }

  const hasEnoughData =
    insights.length >= 2 &&
    (data.week.outbound != null || data.growth.weeklyPct != null || data.economy.month.estimatedCents != null);

  return {
    insights: insights.slice(0, 5),
    actions: actions.slice(0, 5),
    hasEnoughData,
  };
}
