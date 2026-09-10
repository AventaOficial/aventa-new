import { NextResponse } from 'next/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import { getHunterHealthSummary } from '@/lib/hunter/isHunting';
import { HUNTER_SOURCES } from '@/lib/hunter/sources';
import { getDealVerifierMetrics } from '@/lib/verifier';
import { getAutonomousDecisionMetrics, readRecentShadowCycles } from '@/lib/autonomous';
import { getHunterEnrichmentMetrics } from '@/lib/hunter/enrichment';
import { HUNTER_METRIC_UNIVERSES } from '@/lib/hunter/metricUniverses';
import { createServerClient } from '@/lib/supabase/server';
import { getPendingHealth } from '@/lib/moderation/pendingHealth';
import { summarizeSchedulerHealth } from '@/lib/hunter/schedulerHealth';
import { summarizeDayToDaySupply } from '@/lib/hunter/dayToDay';
import { getMlQualityMetrics } from '@/lib/hunter/mlQuality/metrics';

export async function GET(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const summary = await getHunterHealthSummary();
  const supabase = (() => {
    try {
      return createServerClient();
    } catch {
      return null;
    }
  })();
  // Los ciclos shadow persistidos son de OTRO isolate (el worker). Este panel solo lee.
  const [shadowCycles, pendingHealth] = await Promise.all([
    readRecentShadowCycles(supabase, 2),
    getPendingHealth(supabase),
  ]);
  const catalog = HUNTER_SOURCES.map((s) => ({
    id: s.id,
    displayName: s.displayName,
    priority: s.priority,
    external: Boolean(s.external),
    expectedIntervalMs: s.expectedIntervalMs,
    family: s.family ?? 'core',
    country: s.country ?? null,
    affiliateStatus: s.affiliateStatus ?? null,
    discoveryMethod: s.discoveryMethod ?? null,
    capabilities: s.capabilities ?? null,
  }));

  return NextResponse.json(
    {
      isHunting: summary.isHunting,
      huntingLevel: summary.huntingLevel,
      reason: summary.reason,
      lastInsertAt: summary.lastInsertAt,
      sources: summary.sources,
      rows: summary.rows,
      catalog,
      dealVerifier: getDealVerifierMetrics(),
      autonomousDecision: getAutonomousDecisionMetrics(),
      shadowCycles,
      pendingHealth,
      // Salud de la fuente y salud de quien la dispara son preguntas distintas.
      schedulerHealth: summarizeSchedulerHealth(summary.rows),
      dayToDay: summarizeDayToDaySupply(summary.rows),
      mercadoLibreQuality: getMlQualityMetrics(),
      hunterEnrichment: getHunterEnrichmentMetrics(),
      metricUniverses: HUNTER_METRIC_UNIVERSES,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
