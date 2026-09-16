'use client';

import { startTransition, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { BowArrow, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import GlassCard from '@/app/components/panel/GlassCard';
import KpiCard from '@/app/components/panel/KpiCard';
import LoadingState from '@/app/components/panel/LoadingState';
import SectionHeader from '@/app/components/panel/SectionHeader';
import StatusBadge from '@/app/components/panel/StatusBadge';
import { HUNTER_MODULES, type HunterModuleStatus } from '@/lib/hunter/modules';

type HunterStatus = {
  enabled: boolean;
  paused_by_owner?: boolean;
  cron: { schedule: string; deployment_note?: string };
  config: {
    discover_ml?: boolean;
    amazon_asins_count?: number;
    amazon_paapi_enabled?: boolean;
    keepa_enabled?: boolean;
    urls_count: number;
    has_ingest_sources?: boolean;
    external_worker_ingest?: boolean;
    auto_approve_enabled?: boolean;
    auto_approve_min_score?: number;
    reject_below_score?: number;
  };
  capacity: {
    inserted_today_approx?: number | null;
  };
  offers: {
    pending_count: number | null;
    recent: Array<{
      id: string;
      title: string;
      status: string;
      created_at: string;
      store: string | null;
      price: number;
    }>;
  };
};

const SOURCE_HEALTH_ORDER = [
  'ml_worker',
  'ml_api_legacy',
  'amazon_asin',
  'amazon_paapi',
  'env_urls',
] as const;

const SCHEDULER_STATE_COPY: Record<string, string> = {
  healthy: 'El hunter se está disparando dentro del intervalo esperado.',
  degraded: 'El hunter llega tarde, pero sigue llegando. Vigilar.',
  stale: 'El hunter lleva demasiado sin dispararse. Está entrando poca supply nueva.',
  down: 'El hunter no se está disparando. No está entrando supply nueva.',
  disabled: 'Todas las fuentes están desactivadas a propósito.',
};

type HunterHealthPayload = {
  isHunting: boolean;
  huntingLevel?: 'healthy' | 'degraded' | 'down';
  reason: string;
  lastInsertAt: string | null;
  rows: Array<{
    sourceId: string;
    displayStatus: 'healthy' | 'degraded' | 'down' | 'disabled';
    status: string;
    breakerState: string;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    itemsFound: number;
    itemsInserted: number;
    duplicates: number;
    errors: number;
    lastErrorCode: string | null;
  }>;
  catalog: Array<{ id: string; displayName: string }>;
  dayToDay?: {
    recommendation: string;
    sourcesHealthy: number;
    sourcesDegraded: number;
    sourcesDown: number;
    sourcesNotConfigured: number;
    sourcesConfigured: number;
    candidates: number;
    inserted: number;
    duplicates: number;
    skipped: number;
    errors: number;
    sources: Array<{
      id: string;
      displayName: string;
      configuration: 'configured' | 'not_configured' | 'disabled';
      affiliateStatus: string;
      healthStatus: string | null;
      breakerState: string | null;
      lastRunAt: string | null;
      itemsFound: number;
      itemsInserted: number;
      duplicates: number;
      skipped: number;
      errors: number;
      latencyMs: number | null;
      lastErrorCode: string | null;
    }>;
  };
  dealQualification?: {
    candidatesEvaluated: number;
    verifiedDeals: number;
    promotions: number;
    potentialDeals: number;
    noVerifiedDeals: number;
    qualificationPct: number;
    verifiedDealPct: number;
    promotionPct: number;
    potentialDealPct: number;
    catalogOnlyPct: number;
    topRejectionReasons: Array<{ reason: string; count: number }>;
    bySource: Record<
      string,
      {
        evaluated: number;
        verifiedDeals: number;
        promotions: number;
        potentialDeals: number;
        noVerifiedDeals: number;
      }
    >;
  };
  surfaceDiscovery?: Array<{
    surfaceId: string;
    requests: number;
    candidates: number;
    products: number;
    verifiedDeals: number;
    promotions: number;
    potentialDeals: number;
    catalogOnly: number;
    errors: number;
    latencyMs: number;
    evidenceQuality: 'high' | 'medium' | 'low';
    productBindingSuccess: number;
  }>;
  supplyOrchestration?: {
    globalStatus: string;
    recommendedAction: string;
    candidates: number;
    verifiedDeals: number;
    promotions: number;
    pending: number;
    communityCandidates: number;
    machineCandidates: number;
    communityVerified: number;
    machineVerified: number;
    contribution: Array<{
      sourceId: string;
      family: string;
      candidates: number;
      unique: number;
      verified: number;
      duplicates: number;
      errors: number;
      contributionPct: number;
    }>;
    sourceHealth: Array<{
      sourceId: string;
      displayName: string;
      family: string;
      status: string;
      hunterStatus: string | null;
    }>;
  };
  communityQuality?: {
    communitySubmissions: number;
    qualified: number;
    verified: number;
    promotions: number;
    potential: number;
    catalogOnly: number;
    duplicates: number;
    review: number;
    rejected: number;
    errors: number;
    averageVerifierScore: number;
    topRejectionReasons: Array<{ reason: string; count: number }>;
  };
  supplyTruth?: {
    globalStatus: string;
    recommendedAction: string;
    lastFinishedAt: string | null;
    lastOkAt: string | null;
    lastSourceId: string | null;
    stale: boolean;
    hoursSinceLastActivity: number | null;
    windows: Record<
      'today' | 'h24' | 'd7' | 'd30',
      {
        candidates: number;
        verifiedDeals: number;
        duplicates: number;
        errors: number;
        communityVerified: number;
        machineVerified: number;
        communityPct: number;
        machinePct: number;
        contribution: Array<{
          sourceId: string;
          family: string;
          candidates: number;
          verifiedDeals: number;
          contributionPct: number;
          duplicates: number;
          errors: number;
        }>;
      }
    >;
    sourceQuality: Array<{
      sourceId: string;
      hunterStatus: string | null;
      producingCandidates: boolean;
      producingVerified: boolean;
    }>;
    alerts: {
      noVerifiedDealsForHours: boolean;
      allMachineSourcesDown: boolean;
      communitySupplyCollapse: boolean;
      sourceZeroUnexpected: string[];
      duplicateRateSpike: boolean;
    };
  };
  supplyEngine?: {
    mode: string;
    writeEnabled: boolean;
    discovered: number | null;
    verified: number | null;
    highQuality: number | null;
    pendingModeration: number | null;
    qualityRatePct: number | null;
    topNiche: string | null;
    topQuery: string | null;
    topSource: string | null;
    bottleneck: string;
    action: string;
    dailyTargets: {
      discovered: number;
      verified: number;
      highQuality: number;
      approvalReady: number;
    };
    priceMemory: {
      ok: boolean;
      totalRows: number | null;
      rowsToday: number | null;
      productsHistoryReadyEligible7d: number | null;
      snapshotsWithNiche?: number | null;
      snapshotsWithoutNiche?: number | null;
      nicheCoverageRatePct?: number | null;
      stickyPoolEligibleByNiche?: Record<string, number> | null;
    };
    niches: Array<{ id: string; name: string; queryCount: number }>;
  };
  autonomousCalibration?: {
    recommendedAction: string;
    policyVersion: string;
    counts: {
      shadowEvaluated: number;
      shadowMatched: number;
      shadowUnknown: number;
      autoApprove: number;
      autoReject: number;
      humanReview: number;
      agreement: number;
      disagreement: number;
    };
    agreementRate: { display: string; sufficiency: string; sampleSize: number };
    disagreementRate: { display: string; sufficiency: string; sampleSize: number };
    autoApprovePrecision: { display: string; sufficiency: string; sampleSize: number };
    autoRejectPrecision: { display: string; sufficiency: string; sampleSize: number };
    reviewApprovalRate: { display: string; sufficiency: string; sampleSize: number };
    reviewRejectRate: { display: string; sufficiency: string; sampleSize: number };
    collection?: {
      status: string;
      shadowSnapshots: number;
      matched: number;
      awaitingOutcomes: number;
      unknown: number;
      approvedOutcomes: number;
      rejectedOutcomes: number;
      snoozedOutcomes: number;
      expiredOutcomes: number;
      matchRate: { display: string; sufficiency: string };
      lastShadowSnapshotAt: string | null;
      lastHumanOutcomeAt: string | null;
      sufficiency: string;
      byDecision: Array<{
        decision: string;
        snapshots: number;
        matched: number;
        approved: number;
        rejected: number;
        pending: number;
        unknown: number;
      }>;
      bySource: Array<{
        sourceId: string;
        sourceFamily: string;
        sourceLane: string;
        snapshots: number;
        matched: number;
        approved: number;
        rejected: number;
        pending: number;
        matchRate: { display: string };
      }>;
      alerts: {
        noNewShadowSnapshots: boolean;
        noHumanOutcomes: boolean;
        matchRateCollapse: boolean;
        dbWriteFailures: boolean;
      };
    };
    bySource: Array<{
      sourceId: string;
      sourceFamily: string;
      shadowEvaluated: number;
      shadowMatched: number;
      agreementRate: { display: string };
      autoApprovePrecision: { display: string };
      autoRejectPrecision: { display: string };
      reviewApprovalRate: { display: string };
    }>;
    disagreementReasons: Array<{ pair: string; reasonCode: string; count: number }>;
    scoreBuckets: Array<{ bucket: string; evaluated: number; matched: number; agreementRate: { display: string } }>;
    confidenceBuckets: Array<{
      bucket: string;
      evaluated: number;
      matched: number;
      agreementRate: { display: string };
    }>;
  };
  retailerDiscovery?: Array<{
    retailer: string;
    displayName: string;
    status: string;
    implementationStatus: string;
    surfacesTested: number;
    candidates: number;
    evidenceYield: number;
    verifiedDeals: number;
    promotions: number;
    catalogOnly: number;
    potential: number;
    errors: number;
    antiBotRisk: string;
    recommendation: string;
  }>;
  mercadoLibreQuality?: {
    apiHealth: 'healthy' | 'degraded' | 'down';
    imageQualityPct: number;
    averageValidImages: number;
    affiliateReadinessPct: number;
    urlResolutionPct: number;
    priceResolutionPct: number;
    urlsReceived: number;
    urlsResolved: number;
    apiSuccess: number;
    api401: number;
    api403: number;
    apiTimeout: number;
    htmlFallback: number;
    imagesApi: number;
    imagesFallback: number;
    imagesRejected: number;
    affiliateReady: number;
    affiliateMissing: number;
    mlPriceRequests: number;
    mlPriceResolved: number;
    mlPriceUnavailable: number;
    mlPrice401: number;
    mlPrice403: number;
    mlPrice404: number;
    mlPrice429: number;
    mlPriceTimeout: number;
    mlPriceFallback: number;
    mlPriceSourceBreakdown: Record<string, number>;
  };
  dealVerifier?: {
    evaluated: number;
    autoApproved: number;
    review: number;
    rejected: number;
    errors: number;
    topReasons: Array<{ reason: string; count: number }>;
  };
  schedulerHealth?: {
    worstState: 'healthy' | 'degraded' | 'stale' | 'down' | 'disabled';
    needsAttention: boolean;
    sources: Array<{
      sourceId: string;
      state: 'healthy' | 'degraded' | 'stale' | 'down' | 'disabled';
      lastRunAt: string | null;
      hoursSinceLastRun: number | null;
      expectedIntervalMinutes: number;
      expectedRunsPerDay: number;
      reason: string;
    }>;
  };
  pendingHealth?: {
    total: number;
    fresh: number;
    stale: number;
    expiring: number;
    expired: number;
    highQualityStale: number;
    lowQualityStale: number;
    duplicate: number;
    snoozed: number;
    needsAttention: number;
    oldestPendingHours: number | null;
    byAction: Record<'KEEP' | 'PRIORITIZE' | 'SNOOZE' | 'REVIEW' | 'REJECT', number>;
    topAttention: Array<{
      offerId: string;
      state: string;
      action: string;
      ageHours: number | null;
      score: number | null;
      reasons: string[];
    }>;
  };
  shadowCycles?: Array<{
    cycleId: string;
    startedAt: string;
    finishedAt: string;
    evaluated: number;
    autoApprove: number;
    humanReview: number;
    autoReject: number;
    autoApprovePct: number;
    humanReviewPct: number;
    autoRejectPct: number;
    autonomousPct: number;
    avgConfidence: number;
    avgScore: number | null;
    duplicatePass: number;
    duplicateFail: number;
    duplicateUnknown: number;
    imageFound: number;
    imageMissing: number;
    topReasons: Array<{ code: string; label?: string; count: number }>;
    bySource: Record<string, { evaluated: number; autoApprove: number; humanReview: number; autoReject: number }>;
    policyVersion: string;
    schemaVersion: number;
  }>;
  autonomousDecision?: {
    evaluated: number;
    autoApprove: number;
    humanReview: number;
    autoReject: number;
    autonomousPct: number;
    autoApprovePct?: number;
    humanReviewPct?: number;
    autoRejectPct?: number;
    avgConfidence?: number;
    duplicatePass?: number;
    duplicateFail?: number;
    duplicateUnknown?: number;
    imageFound?: number;
    imageMissing?: number;
    verifier?: { autoApprove: number; review: number; reject: number };
    topReasons: Array<{ reason: string; code?: string; label?: string; count: number }>;
    recent?: Array<{
      source: string;
      decision: string;
      confidence: number;
      score: number | null;
      reasons: string[];
      at: string;
    }>;
    avgScore?: number | null;
    bySource: Record<string, { evaluated: number; autoApprove: number; humanReview: number; autoReject: number }>;
    firstAt?: string | null;
    lastAt?: string | null;
    currentCycle?: {
      evaluated: number;
      autoApprovePct: number;
      humanReviewPct: number;
      autoRejectPct: number;
      autonomousPct: number;
      startedAt: string | null;
      endedAt: string | null;
    };
    lastCycle?: {
      evaluated: number;
      autoApprovePct: number;
      humanReviewPct: number;
      autoRejectPct: number;
      autonomousPct: number;
      startedAt: string | null;
      endedAt: string | null;
    };
    persistence?: 'process_memory';
  };
  hunterEnrichment?: {
    candidatesFound: number;
    enriched: number;
    imageFound: number;
    imageMissing: number;
    titleFound: number;
    priceFound: number;
    enrichmentFailed: number;
    completePct: number;
    fullyComplete?: number;
    fullyCompletePct?: number;
    persistence?: 'process_memory';
  };
  metricUniverses?: {
    sourceHealth: { persistence: string; itemsFound: string };
    hunterEnrichment: { persistence: string };
    dealVerifier: { persistence: string };
    autonomousShadow: { persistence: string };
  };
};

const MODULE_TONE: Record<HunterModuleStatus, 'ok' | 'attention' | 'neutral'> = {
  live: 'ok',
  partial: 'attention',
  planned: 'neutral',
};

const MODULE_LABEL: Record<HunterModuleStatus, string> = {
  live: 'En producción',
  partial: 'Parcial',
  planned: 'Siguiente',
};

function healthTone(status: string): 'ok' | 'attention' | 'critical' | 'neutral' {
  if (status === 'healthy' || status === 'HEALTHY') return 'ok';
  if (status === 'degraded' || status === 'DEGRADED' || status === 'AT_RISK' || status === 'stale') {
    return 'attention';
  }
  if (status === 'down' || status === 'DOWN' || status === 'BLOCKED') return 'critical';
  return 'neutral';
}

function healthEmoji(status: string): string {
  if (status === 'healthy') return '🟢';
  if (status === 'degraded') return '🟡';
  if (status === 'down') return '🔴';
  return '⚫';
}

function formatGlobalStatus(status: string): string {
  if (status === 'AT_RISK') return 'AT RISK';
  return status.replace(/_/g, ' ');
}

type CeoAlert = {
  id: string;
  severity: 'critical' | 'attention' | 'info';
  message: string;
  href?: string;
};

/** Solo agrega señales ya expuestas por hunter-health / bot-ingest-status. */
function buildCeoAlerts(input: {
  health: HunterHealthPayload | null;
  pendingCount: number | null;
}): CeoAlert[] {
  const alerts: CeoAlert[] = [];
  const h = input.health;
  const truth = h?.supplyTruth;
  const pending = h?.pendingHealth;
  const scheduler = h?.schedulerHealth;
  const calibration = h?.autonomousCalibration;

  if (h?.huntingLevel === 'down') {
    alerts.push({
      id: 'hunting-down',
      severity: 'critical',
      message: h.reason || 'Hunter DOWN: no está entrando supply nueva.',
    });
  } else if (h?.huntingLevel === 'degraded') {
    alerts.push({
      id: 'hunting-degraded',
      severity: 'attention',
      message: h.reason || 'Hunter degradado.',
    });
  }

  if (truth?.alerts.allMachineSourcesDown) {
    alerts.push({
      id: 'machine-down',
      severity: 'critical',
      message: 'Todas las fuentes machine están caídas.',
    });
  }
  if (truth?.alerts.noVerifiedDealsForHours) {
    alerts.push({
      id: 'zero-verified-24h',
      severity: 'critical',
      message: '0 verified deals en las últimas 24h.',
    });
  }
  if (truth?.alerts.communitySupplyCollapse) {
    alerts.push({
      id: 'community-collapse',
      severity: 'attention',
      message: 'Community supply colapsó vs. la ventana de 7d.',
    });
  }
  if (truth?.alerts.duplicateRateSpike) {
    alerts.push({
      id: 'dup-spike',
      severity: 'attention',
      message: 'Spike de duplicados en supply 24h.',
    });
  }
  for (const sourceId of truth?.alerts.sourceZeroUnexpected ?? []) {
    alerts.push({
      id: `zero-${sourceId}`,
      severity: 'attention',
      message: `${sourceId} healthy pero sin candidatos/verified.`,
    });
  }

  if (scheduler?.needsAttention) {
    const worst = scheduler.sources.filter((s) => s.state === 'down' || s.state === 'stale');
    alerts.push({
      id: 'scheduler',
      severity: worst.some((s) => s.state === 'down') ? 'critical' : 'attention',
      message:
        worst.length > 0
          ? `Scheduler: ${worst.map((s) => `${s.sourceId}=${s.state}`).join(', ')}`
          : 'Scheduler requiere atención.',
    });
  }

  if (pending && pending.needsAttention > 0) {
    alerts.push({
      id: 'pending-attention',
      severity: 'attention',
      message: `Revisar ${pending.needsAttention} oferta(s) en cola de moderación (${pending.total} pending).`,
      href: '/admin/moderation',
    });
  } else if ((input.pendingCount ?? 0) > 40) {
    alerts.push({
      id: 'pending-backlog',
      severity: 'attention',
      message: `Cola pending alta: ${input.pendingCount} ofertas.`,
      href: '/admin/moderation',
    });
  }

  const col = calibration?.collection;
  if (col?.alerts.dbWriteFailures) {
    alerts.push({
      id: 'cal-db',
      severity: 'critical',
      message: 'Calibration: fallos de escritura en DB.',
    });
  }
  if (col?.alerts.noNewShadowSnapshots) {
    alerts.push({
      id: 'cal-shadow',
      severity: 'attention',
      message: 'Calibration: sin shadow snapshots nuevos.',
    });
  }
  if (col?.alerts.noHumanOutcomes) {
    alerts.push({
      id: 'cal-human',
      severity: 'info',
      message: 'Calibration: sin outcomes humanos recientes.',
      href: '/admin/moderation',
    });
  }
  if (col?.alerts.matchRateCollapse) {
    alerts.push({
      id: 'cal-match',
      severity: 'attention',
      message: 'Calibration: match rate colapsó.',
    });
  }

  return alerts;
}

function deriveCeoRecommendation(input: {
  health: HunterHealthPayload | null;
  alerts: CeoAlert[];
}): string {
  const truth = input.health?.supplyTruth;
  const supply = input.health?.supplyOrchestration;
  const pending = input.health?.pendingHealth;
  const calibration = input.health?.autonomousCalibration;

  const critical = input.alerts.filter((a) => a.severity === 'critical');
  if (critical.length > 0) return critical[0].message;

  if (pending && pending.needsAttention > 0) {
    return `Revisar ${pending.needsAttention} oferta(s) en /admin/moderation.`;
  }

  const base =
    truth?.recommendedAction?.trim() ||
    supply?.recommendedAction?.trim() ||
    calibration?.recommendedAction?.trim() ||
    '';

  if (
    (truth?.globalStatus === 'HEALTHY' || (!truth && supply?.globalStatus === 'HEALTHY')) &&
    input.alerts.length === 0
  ) {
    return 'No action';
  }

  if (/no action required/i.test(base) && input.alerts.length === 0) {
    return 'No action';
  }

  if (base) return base;

  const attention = input.alerts.find((a) => a.severity === 'attention');
  if (attention) return attention.message;

  return 'No action';
}

function deriveGlobalStatus(health: HunterHealthPayload | null): string {
  if (health?.supplyTruth?.globalStatus) return health.supplyTruth.globalStatus;
  if (health?.supplyOrchestration?.globalStatus) return health.supplyOrchestration.globalStatus;
  if (health?.huntingLevel === 'healthy') return 'HEALTHY';
  if (health?.huntingLevel === 'degraded') return 'DEGRADED';
  if (health?.huntingLevel === 'down') return 'DOWN';
  return 'UNKNOWN';
}

export default function HunterPage() {
  const [data, setData] = useState<HunterStatus | null>(null);
  const [health, setHealth] = useState<HunterHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [truthWindow, setTruthWindow] = useState<'today' | 'h24' | 'd7' | 'd30'>('h24');

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setError('Sin sesión');
      setLoading(false);
      return;
    }
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const [statusRes, healthRes] = await Promise.all([
      fetch('/api/admin/bot-ingest-status', { headers }),
      fetch('/api/admin/hunter-health', { headers }),
    ]);
    if (!statusRes.ok) {
      setError('No se pudo leer el estado del cazador');
      setLoading(false);
      return;
    }
    setData((await statusRes.json()) as HunterStatus);
    if (healthRes.ok) {
      setHealth((await healthRes.json()) as HunterHealthPayload);
    }
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    startTransition(() => {
      void load();
    });
  }, [load]);

  // Persistido en DB (otro isolate), no las métricas en memoria de este proceso.
  const lastShadowCycle = health?.shadowCycles?.[0] ?? null;
  const prevShadowCycle = health?.shadowCycles?.[1] ?? null;
  const pending = health?.pendingHealth ?? null;
  const scheduler = health?.schedulerHealth ?? null;
  const dayToDay = health?.dayToDay ?? null;
  const dealQualification = health?.dealQualification ?? null;
  const surfaceDiscovery = health?.surfaceDiscovery ?? null;
  const retailerDiscovery = health?.retailerDiscovery ?? null;
  const supply = health?.supplyOrchestration ?? null;
  const communityQuality = health?.communityQuality ?? null;
  const supplyTruth = health?.supplyTruth ?? null;
  const truth = supplyTruth?.windows?.[truthWindow] ?? null;
  const calibration = health?.autonomousCalibration ?? null;
  const mlQuality = health?.mercadoLibreQuality ?? null;

  const runNow = async () => {
    setRunning(true);
    setRunMsg(null);
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setRunMsg('Sin sesión');
      setRunning(false);
      return;
    }
    const res = await fetch('/api/admin/bot-ingest-run-now', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      enabled?: boolean;
      pausedByOwner?: boolean;
      runMode?: string;
      summary?: {
        inserted?: number;
        skipped?: number;
        rejected?: number;
        duplicate?: number;
        stageCounts?: { collected?: number; evaluated?: number };
        skipReasonCounts?: Record<string, number>;
        sourceStats?: { ml_api?: { collected?: number } };
      };
    };
    if (!res.ok) {
      setRunMsg(body.error ?? 'Falló el ciclo');
      setRunning(false);
      await load();
      return;
    }
    if (body.pausedByOwner) {
      setRunMsg('Pausado en Automations (Permitir ejecución del bot).');
    } else if (body.enabled === false) {
      setRunMsg('Bot apagado en env (BOT_INGEST_ENABLED).');
    } else {
      const topSkips = Object.entries(body.summary?.skipReasonCounts ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([reason, n]) => `${reason} ×${n}`)
        .join(' · ');
      const mlCollected = body.summary?.sourceStats?.ml_api?.collected ?? 0;
      const collected = body.summary?.stageCounts?.collected ?? 0;
      setRunMsg(
        [
          `Modo ${body.runMode ?? '—'}.`,
          `Insertadas ${body.summary?.inserted ?? 0}`,
          `omitidas ${body.summary?.skipped ?? 0}`,
          `rechazadas ${body.summary?.rejected ?? 0}`,
          `dup ${body.summary?.duplicate ?? 0}.`,
          `Pool ${collected} (ML búsqueda ${mlCollected}).`,
          topSkips
            ? `Top filtros: ${topSkips}`
            : mlCollected === 0
              ? 'Sin candidatos ML: API bloqueada o sin resultados.'
              : '',
        ]
          .filter(Boolean)
          .join(' ')
      );
    }
    setRunning(false);
    await load();
  };

  const runningOk = Boolean(data?.enabled && !data.paused_by_owner);
  const nameById = new Map((health?.catalog ?? []).map((c) => [c.id, c.displayName]));
  const globalStatus = deriveGlobalStatus(health);
  const ceoAlerts = buildCeoAlerts({
    health,
    pendingCount: data?.offers.pending_count ?? null,
  });
  const ceoRecommendation = deriveCeoRecommendation({ health, alerts: ceoAlerts });
  const h24 = supplyTruth?.windows?.h24 ?? null;
  const sourceRows = health?.rows ?? [];
  const sourcesHealthy = sourceRows.filter((r) => r.displayStatus === 'healthy').length;
  const sourcesDegraded = sourceRows.filter((r) => r.displayStatus === 'degraded').length;
  const sourcesDown = sourceRows.filter((r) => r.displayStatus === 'down').length;
  const sourcesDisabled = sourceRows.filter((r) => r.displayStatus === 'disabled').length;
  const supplySources = supply?.sourceHealth ?? [];
  const machineSources = supplySources.filter((r) => r.family !== 'community');
  const machineUp = machineSources.filter((r) => r.status === 'HEALTHY').length;
  const machineDown = machineSources.filter(
    (r) => r.status === 'DOWN' || r.status === 'BLOCKED',
  ).length;
  const calibrationStatus =
    calibration?.collection?.status ??
    (calibration ? 'outcomes_ready' : 'unavailable');
  const calibrationSufficiency = calibration?.collection?.sufficiency ?? calibration?.agreementRate?.sufficiency;
  const noAction = /^no action$/i.test(ceoRecommendation.trim());

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] glass-dark p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
              Aventa Launch
            </p>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight text-white/90 sm:text-3xl">
              <BowArrow className="h-7 w-7 shrink-0 text-violet-300 sm:h-8 sm:w-8" />
              CEO Control Center
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-white/50 leading-relaxed">
              Centro operativo único: salud de supply, fuentes y cola. El motor observa; no publica ni
              rechaza solo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            {data ? (
              <StatusBadge tone={runningOk ? 'ok' : 'attention'} pulse={runningOk}>
                {runningOk ? 'Bot Running' : data.paused_by_owner ? 'Bot Pausado' : 'Bot Apagado'}
              </StatusBadge>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || running}
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => void runNow()}
              disabled={running}
              className="inline-flex items-center gap-2 rounded-full bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
              Explorar ahora
            </button>
            <Link
              href="/admin/moderation"
              className="rounded-full border border-violet-400/30 px-3 py-2 text-sm text-violet-200 hover:bg-violet-500/10"
            >
              Cola de revisión
            </Link>
            <Link
              href="/admin/operaciones/trabajo"
              className="text-sm text-white/45 hover:underline"
            >
              Automations
            </Link>
          </div>
        </div>
        {runMsg ? <p className="mt-3 text-sm text-white/55">{runMsg}</p> : null}
      </section>

      {loading ? (
        <LoadingState message="Consultando al cazador…" />
      ) : error ? (
        <GlassCard>
          <p className="text-sm text-red-300">{error}</p>
        </GlassCard>
      ) : data ? (
        <>
          <section className="rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                  Estado global
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge
                    tone={healthTone(globalStatus)}
                    pulse={globalStatus === 'HEALTHY'}
                    className="text-sm px-3 py-1"
                  >
                    {formatGlobalStatus(globalStatus)}
                  </StatusBadge>
                  <StatusBadge tone={health?.isHunting ? 'ok' : 'neutral'}>
                    {health?.isHunting ? 'Cazando' : 'Sin yield reciente'}
                  </StatusBadge>
                  {supplyTruth?.stale ? (
                    <StatusBadge tone="attention">Stale</StatusBadge>
                  ) : null}
                </div>
              </div>
              <div className="max-w-xl rounded-2xl border border-white/[0.08] bg-black/20 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  Recomendación
                </p>
                <p
                  className={`mt-1 text-sm font-medium leading-snug ${
                    noAction ? 'text-emerald-300' : 'text-amber-100'
                  }`}
                >
                  {ceoRecommendation}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Candidatos 24h" value={String(h24?.candidates ?? 0)} />
              <KpiCard
                label="Nuevas (hoy)"
                value={String(data.capacity.inserted_today_approx ?? '—')}
              />
              <KpiCard label="Verified 24h" value={String(h24?.verifiedDeals ?? 0)} />
              <KpiCard label="Duplicates 24h" value={String(h24?.duplicates ?? 0)} />
              <KpiCard
                label="Pending"
                value={String(pending?.total ?? data.offers.pending_count ?? '—')}
              />
              <KpiCard label="Errors 24h" value={String(h24?.errors ?? 0)} />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  Machine vs Community (24h verified)
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <KpiCard
                    label="Machine"
                    value={`${h24?.machineVerified ?? 0} · ${Math.round(h24?.machinePct ?? 0)}%`}
                  />
                  <KpiCard
                    label="Community"
                    value={`${h24?.communityVerified ?? 0} · ${Math.round(h24?.communityPct ?? 0)}%`}
                  />
                </div>
                <p className="mt-3 text-xs text-white/45">
                  Orquestación actual: machine {supply?.machineVerified ?? 0} verified / community{' '}
                  {supply?.communityVerified ?? 0} verified · pending cola {supply?.pending ?? '—'}
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  Fuentes
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiCard label="Healthy" value={String(sourcesHealthy)} />
                  <KpiCard label="Degraded" value={String(sourcesDegraded)} />
                  <KpiCard label="Down" value={String(sourcesDown)} />
                  <KpiCard label="Disabled" value={String(sourcesDisabled)} />
                </div>
                <p className="mt-3 text-xs text-white/45">
                  Supply registry: {machineUp} machine up · {machineDown} machine down/blocked · última
                  actividad{' '}
                  {supplyTruth?.lastFinishedAt
                    ? new Date(supplyTruth.lastFinishedAt).toLocaleString('es-MX')
                    : health?.lastInsertAt
                      ? new Date(health.lastInsertAt).toLocaleString('es-MX')
                      : '—'}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  Alertas / acciones humanas
                </p>
                {ceoAlerts.length === 0 ? (
                  <p className="mt-3 text-sm text-emerald-300/90">Sin alertas. No action.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {ceoAlerts.slice(0, 8).map((alert) => (
                      <li key={alert.id} className="flex items-start gap-2 text-sm">
                        <StatusBadge
                          tone={
                            alert.severity === 'critical'
                              ? 'critical'
                              : alert.severity === 'attention'
                                ? 'attention'
                                : 'info'
                          }
                        >
                          {alert.severity}
                        </StatusBadge>
                        {alert.href ? (
                          <Link href={alert.href} className="text-white/75 underline-offset-2 hover:underline">
                            {alert.message}
                          </Link>
                        ) : (
                          <span className="text-white/70">{alert.message}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  Calibration
                </p>
                {calibration ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusBadge tone={healthTone(calibrationStatus === 'collecting' ? 'degraded' : 'healthy')}>
                        {calibrationStatus}
                      </StatusBadge>
                      {calibrationSufficiency ? (
                        <StatusBadge tone="neutral">{String(calibrationSufficiency).toUpperCase()}</StatusBadge>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <KpiCard label="Agreement" value={calibration.agreementRate.display} />
                      <KpiCard
                        label="Matched"
                        value={String(
                          calibration.collection?.matched ?? calibration.counts.shadowMatched,
                        )}
                      />
                    </div>
                    <p className="mt-3 text-xs text-white/45">{calibration.recommendedAction}</p>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-white/45">Sin calibración persistida todavía.</p>
                )}
              </div>
            </div>
          </section>

          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/35">
            Detalle operativo
          </p>

          <GlassCard>
            <SectionHeader
              title="Supply Engine"
              subtitle="1 engine + NicheHunterProfiles. WRITE fail-closed. Price Memory ≠ descuento de etiqueta."
            />
            {health?.supplyEngine ? (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiCard label="Discovered today" value={String(health.supplyEngine.discovered ?? '—')} />
                  <KpiCard label="Verified today" value={String(health.supplyEngine.verified ?? '—')} />
                  <KpiCard label="High quality" value={String(health.supplyEngine.highQuality ?? '—')} />
                  <KpiCard
                    label="Pending mod"
                    value={String(health.supplyEngine.pendingModeration ?? '—')}
                  />
                </div>
                <p className="mt-3 text-sm text-white/80">{health.supplyEngine.action}</p>
                <p className="mt-1 text-xs text-white/45">
                  bottleneck={health.supplyEngine.bottleneck} · mode={health.supplyEngine.mode} · WRITE=
                  {health.supplyEngine.writeEnabled ? '1' : '0'} · top niche={health.supplyEngine.topNiche ?? '—'}{' '}
                  · top query={health.supplyEngine.topQuery ?? '—'} · PM ready=
                  {health.supplyEngine.priceMemory?.productsHistoryReadyEligible7d ?? '—'}
                  {' · '}PM niche=
                  {health.supplyEngine.priceMemory?.nicheCoverageRatePct ?? '—'}%
                  {' · '}pool sticky=
                  {health.supplyEngine.priceMemory?.stickyPoolEligibleByNiche
                    ? `b${health.supplyEngine.priceMemory.stickyPoolEligibleByNiche.beauty ?? 0}/e${health.supplyEngine.priceMemory.stickyPoolEligibleByNiche.electronics ?? 0}/d${health.supplyEngine.priceMemory.stickyPoolEligibleByNiche.day_to_day ?? 0}`
                    : '—'}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-white/45">Sin datos Supply Engine.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Supply Truth"
              subtitle="Persistido en hunter_supply_runs. Métrica principal: verified deal contribution. No mezclar con source health ni autonomousPct."
            />
            {supplyTruth ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(['today', 'h24', 'd7', 'd30'] as const).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setTruthWindow(id)}
                      className={`rounded-full px-3 py-1 text-xs ${
                        truthWindow === id ? 'bg-violet-500 text-white' : 'bg-white/10 text-white/60'
                      }`}
                    >
                      {id === 'today' ? 'Hoy' : id === 'h24' ? '24h' : id === 'd7' ? '7d' : '30d'}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiCard label="Global" value={supplyTruth.globalStatus} />
                  <KpiCard
                    label="Última actividad"
                    value={
                      supplyTruth.lastFinishedAt
                        ? new Date(supplyTruth.lastFinishedAt).toLocaleString('es-MX')
                        : '—'
                    }
                  />
                  <KpiCard label="Verified 24h" value={String(supplyTruth.windows.h24.verifiedDeals)} />
                  <KpiCard label="Candidatos" value={String(truth?.candidates ?? 0)} />
                  <KpiCard label="Duplicates" value={String(truth?.duplicates ?? 0)} />
                  <KpiCard label="Errors" value={String(truth?.errors ?? 0)} />
                  <KpiCard label="Community verified" value={String(truth?.communityVerified ?? 0)} />
                  <KpiCard label="Machine verified" value={String(truth?.machineVerified ?? 0)} />
                </div>
                <p className="mt-3 text-sm text-white/80">{supplyTruth.recommendedAction}</p>
                {truth && truth.contribution.length > 0 ? (
                  <ul className="mt-4 space-y-1.5 text-xs text-white/45">
                    {truth.contribution.map((row) => (
                      <li key={row.sourceId}>
                        {row.sourceId} ({row.family}): {row.verifiedDeals} verified ({row.contributionPct}
                        %) · cand {row.candidates} · dups {row.duplicates} · err {row.errors}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-white/40">
                    Sin snapshots persistidos en esta ventana. Ceros son esperados hasta la primera corrida.
                  </p>
                )}
                <ul className="mt-3 space-y-1 text-xs text-white/40">
                  {supplyTruth.sourceQuality.slice(0, 8).map((row) => (
                    <li key={row.sourceId}>
                      {row.sourceId}: health {row.hunterStatus ?? '—'} · cand{' '}
                      {row.producingCandidates ? 'sí' : 'no'} · verified{' '}
                      {row.producingVerified ? 'sí' : 'no'}
                    </li>
                  ))}
                </ul>
                {(supplyTruth.alerts.noVerifiedDealsForHours ||
                  supplyTruth.alerts.allMachineSourcesDown ||
                  supplyTruth.alerts.communitySupplyCollapse ||
                  supplyTruth.alerts.duplicateRateSpike) && (
                  <p className="mt-3 text-xs text-amber-200/80">
                    Alert-ready:{' '}
                    {[
                      supplyTruth.alerts.noVerifiedDealsForHours ? '0 verified 24h' : null,
                      supplyTruth.alerts.allMachineSourcesDown ? 'machine down' : null,
                      supplyTruth.alerts.communitySupplyCollapse ? 'community collapse' : null,
                      supplyTruth.alerts.duplicateRateSpike ? 'duplicate spike' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">Sin Supply Truth persistido.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Supply Orchestration"
              subtitle="Many sources → one IngestItem → one pipeline. Contribution = verified deals. No mezclar con autonomousPct ni source health."
            />
            {supply ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiCard label="Global" value={supply.globalStatus} />
                  <KpiCard label="Candidatos" value={String(supply.candidates)} />
                  <KpiCard label="Verified deals" value={String(supply.verifiedDeals)} />
                  <KpiCard label="Promotions" value={String(supply.promotions)} />
                  <KpiCard label="Pending" value={String(supply.pending)} />
                  <KpiCard label="Community cand." value={String(supply.communityCandidates)} />
                  <KpiCard label="Machine cand." value={String(supply.machineCandidates)} />
                  <KpiCard label="Community verified" value={String(supply.communityVerified)} />
                </div>
                <p className="mt-3 text-sm text-white/70">{supply.recommendedAction}</p>
                <ul className="mt-4 space-y-2">
                  {supply.sourceHealth.map((row) => (
                    <li
                      key={row.sourceId}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2.5"
                    >
                      <div>
                        <p className="text-sm text-white/85">{row.displayName}</p>
                        <p className="text-xs text-white/40">
                          {row.family} · {row.sourceId}
                        </p>
                      </div>
                      <StatusBadge
                        tone={
                          row.status === 'HEALTHY'
                            ? 'ok'
                            : row.status === 'DOWN' || row.status === 'BLOCKED'
                              ? 'critical'
                              : 'neutral'
                        }
                      >
                        {row.status}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
                {supply.contribution.length > 0 ? (
                  <ul className="mt-3 space-y-1.5 text-xs text-white/45">
                    {supply.contribution.map((row) => (
                      <li key={row.sourceId}>
                        {row.sourceId}: {row.verified} verified ({row.contributionPct}%) · cand{' '}
                        {row.candidates} · dups {row.duplicates} · err {row.errors}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-white/40">
                    Sin corrida del router en este isolate. El registry y la salud sí se muestran.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">Sin snapshot de supply en este isolate.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Community Quality Pipeline"
              subtitle="POST /api/offers en este isolate. Quality contract canónico. Siempre pending."
            />
            {communityQuality ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiCard label="Submissions" value={String(communityQuality.communitySubmissions)} />
                  <KpiCard label="Verified" value={String(communityQuality.verified)} />
                  <KpiCard label="Review" value={String(communityQuality.review)} />
                  <KpiCard label="Duplicates" value={String(communityQuality.duplicates)} />
                  <KpiCard label="Invalid / errors" value={String(communityQuality.errors)} />
                  <KpiCard
                    label="Avg verifier"
                    value={String(communityQuality.averageVerifierScore)}
                  />
                  <KpiCard label="Potential" value={String(communityQuality.potential)} />
                  <KpiCard label="Catálogo" value={String(communityQuality.catalogOnly)} />
                </div>
                {communityQuality.topRejectionReasons.length > 0 ? (
                  <ul className="mt-3 space-y-1.5 text-xs text-white/45">
                    {communityQuality.topRejectionReasons.map((row) => (
                      <li key={row.reason}>
                        {row.reason} ×{row.count}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-white/40">
                    Sin submissions community en este isolate. Ceros son esperados si POST corrió en otra función.
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">Sin métricas community en este isolate.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Source Health"
              subtitle="Último batch persistido en hunter_source_health. found = payload crudo, no Shadow evaluated."
            />
            <ul className="mt-4 space-y-2">
              {SOURCE_HEALTH_ORDER.map((sourceId) => {
                const row = (health?.rows ?? []).find((r) => r.sourceId === sourceId);
                const status = row?.displayStatus ?? 'disabled';
                return (
                  <li
                    key={sourceId}
                    className="flex flex-col gap-1 rounded-xl bg-white/[0.03] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white/85">
                        {healthEmoji(status)} {nameById.get(sourceId) ?? sourceId}
                      </p>
                      <p className="text-xs text-white/40">
                        {sourceId}
                        {row ? ` · breaker ${row.breakerState}` : ' · sin telemetría'}
                        {row?.lastErrorCode ? ` · err ${row.lastErrorCode}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                      <StatusBadge tone={healthTone(status)}>{status}</StatusBadge>
                      <span>found {row?.itemsFound ?? 0}</span>
                      <span>ins {row?.itemsInserted ?? 0}</span>
                      <span>dup {row?.duplicates ?? 0}</span>
                      <span>err {row?.errors ?? 0}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Retailer Discovery Matrix"
              subtitle="Evaluación de retailers. Evidence yield ≠ source health ≠ autonomousPct. No inserta."
            />
            {retailerDiscovery && retailerDiscovery.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {retailerDiscovery.map((row) => (
                  <li key={row.retailer} className="rounded-xl bg-white/[0.03] px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm text-white/85">{row.displayName}</p>
                      <StatusBadge
                        tone={
                          row.status === 'READY'
                            ? 'ok'
                            : row.status === 'BLOCKED_PENDING_POLICY_REVIEW'
                              ? 'critical'
                              : 'neutral'
                        }
                      >
                        {row.status}
                      </StatusBadge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/45">
                      <span>surfaces {row.surfacesTested}</span>
                      <span>cand {row.candidates}</span>
                      <span>yield {row.evidenceYield}</span>
                      <span>verified {row.verifiedDeals}</span>
                      <span>promo {row.promotions}</span>
                      <span>catálogo {row.catalogOnly}</span>
                      <span>err {row.errors}</span>
                      <span>antibot {row.antiBotRisk}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-white/40">{row.recommendation}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-white/40">Sin matriz de discovery en este isolate.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Scheduler health"
              subtitle="¿Se está disparando el hunter? Es otra pregunta que si la fuente respondió bien la última vez."
            />
            {scheduler ? (
              <>
                <p className="mt-3 text-sm text-white/80">
                  {SCHEDULER_STATE_COPY[scheduler.worstState]}
                </p>
                <ul className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-3">
                  {scheduler.sources.map((row) => (
                    <li key={row.sourceId} className="text-xs text-white/50">
                      <span className="font-mono text-white/80">{row.sourceId}</span>{' '}
                      <span
                        className={
                          row.state === 'healthy'
                            ? 'text-emerald-300/80'
                            : row.state === 'disabled'
                              ? 'text-white/35'
                              : row.state === 'degraded'
                                ? 'text-amber-300/80'
                                : 'text-rose-300/80'
                        }
                      >
                        {row.state}
                      </span>
                      {row.hoursSinceLastRun == null
                        ? ' · nunca corrió'
                        : ` · hace ${row.hoursSinceLastRun} h`}
                      <span className="text-white/35">
                        {' '}
                        — {row.reason} (esperado cada {row.expectedIntervalMinutes} min ≈{' '}
                        {row.expectedRunsPerDay}/día)
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-white/35">
                  Las tolerancias son múltiplos del intervalo que promete cada fuente, no minutos
                  fijos. Un cron puede llegar tarde; lo que importa es que deje de llegar.
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">Sin datos de scheduler.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Pending health"
              subtitle="Clasificación derivada de la cola pending. Recomendación, no acción: nada se ejecuta solo."
            />
            {pending ? (
              <>
                <p className="mt-3 text-sm text-white/80">
                  {pending.needsAttention === 0
                    ? `Todo bien. ${pending.total} pending en cola, ninguna requiere atención.`
                    : `Revisar ${pending.needsAttention} ${pending.needsAttention === 1 ? 'oferta' : 'ofertas'} de ${pending.total} pending.`}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                  <KpiCard label="Total pending" value={String(pending.total)} />
                  <KpiCard label="Fresh" value={String(pending.fresh)} />
                  <KpiCard label="Stale" value={String(pending.stale)} />
                  <KpiCard label="Por caducar" value={String(pending.expiring)} />
                  <KpiCard label="Caducadas" value={String(pending.expired)} />
                  <KpiCard label="Duplicadas" value={String(pending.duplicate)} />
                  <KpiCard label="Pospuestas" value={String(pending.snoozed)} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiCard label="Stale buenas" value={String(pending.highQualityStale)} />
                  <KpiCard label="Stale flojas" value={String(pending.lowQualityStale)} />
                  <KpiCard label="Priorizar" value={String(pending.byAction?.PRIORITIZE ?? 0)} />
                  <KpiCard label="Revisar" value={String(pending.byAction?.REVIEW ?? 0)} />
                </div>
                {pending.topAttention.length > 0 ? (
                  <ul className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-3">
                    {pending.topAttention.map((row) => (
                      <li key={row.offerId} className="text-xs text-white/50">
                        <a
                          href={`/admin/moderation?focus=${row.offerId}`}
                          className="text-white/80 underline decoration-white/20 underline-offset-2 hover:text-white"
                        >
                          {row.action}
                        </a>{' '}
                        <span className="font-mono text-white/65">{row.state}</span>
                        {row.ageHours != null ? ` · ${row.ageHours} h` : ''}
                        {row.score != null ? ` · score ${row.score}` : ''}
                        {row.reasons.length > 0 ? (
                          <span className="text-white/35"> — {row.reasons.join(' · ')}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-3 text-xs text-white/35">
                  La más antigua lleva{' '}
                  {pending.oldestPendingHours == null ? '—' : `${pending.oldestPendingHours} h`} en cola.
                  Stale = {'>'} 72 h sin moderar. Abre cualquiera en Focus con el enlace de su acción.
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">Sin datos de cola pending.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Shadow cycle (persistido)"
              subtitle="Último ciclo del worker guardado en hunter_shadow_cycles. NO es realtime: es una foto del ciclo ya cerrado."
            />
            {lastShadowCycle ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                  <KpiCard label="Evaluados" value={String(lastShadowCycle.evaluated)} />
                  <KpiCard label="Auto approve %" value={`${lastShadowCycle.autoApprovePct}%`} />
                  <KpiCard label="Human review %" value={`${lastShadowCycle.humanReviewPct}%`} />
                  <KpiCard label="Auto reject %" value={`${lastShadowCycle.autoRejectPct}%`} />
                  <KpiCard label="Autonomous %" value={`${lastShadowCycle.autonomousPct}%`} />
                  <KpiCard
                    label="Score promedio"
                    value={lastShadowCycle.avgScore == null ? '—' : String(lastShadowCycle.avgScore)}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
                  <KpiCard label="dup pass" value={String(lastShadowCycle.duplicatePass)} />
                  <KpiCard label="dup fail" value={String(lastShadowCycle.duplicateFail)} />
                  <KpiCard label="dup unknown" value={String(lastShadowCycle.duplicateUnknown)} />
                  <KpiCard label="imagen ok" value={String(lastShadowCycle.imageFound)} />
                  <KpiCard label="imagen missing" value={String(lastShadowCycle.imageMissing)} />
                </div>
                <p className="mt-3 text-xs text-white/35">
                  Cerrado:{' '}
                  {lastShadowCycle.finishedAt
                    ? new Date(lastShadowCycle.finishedAt).toLocaleString('es-MX')
                    : '—'}
                  {' · policy '}
                  <span className="font-mono">{lastShadowCycle.policyVersion}</span>
                  {' · schema v'}
                  {lastShadowCycle.schemaVersion}
                </p>
                <p className="mt-1 text-xs text-white/35">
                  {prevShadowCycle
                    ? `Ciclo previo: ${prevShadowCycle.evaluated} eval, autónomo ${prevShadowCycle.autonomousPct}% (${
                        prevShadowCycle.finishedAt
                          ? new Date(prevShadowCycle.finishedAt).toLocaleString('es-MX')
                          : '—'
                      })`
                    : 'Ciclo previo: aún no hay un segundo ciclo persistido.'}
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">
                Sin ciclos persistidos. Se escribe uno al cerrar cada corrida con candidatos evaluados;
                si la tabla hunter_shadow_cycles no existe todavía, aplica la migración.
              </p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Shadow Autonomy (este isolate)"
              subtitle="AUTO_APPROVE = podrían publicarse solos. Autonomous % = AUTO_APPROVE + AUTO_REJECT. No publica. Memoria de ESTE isolate — en Vercel no es el batch de ml_worker (eso vive en hunter_source_health)."
            />
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Evaluados" value={String(health?.autonomousDecision?.evaluated ?? 0)} />
              <KpiCard
                label="Auto approve %"
                value={`${health?.autonomousDecision?.autoApprovePct ?? 0}%`}
              />
              <KpiCard
                label="Human review %"
                value={`${health?.autonomousDecision?.humanReviewPct ?? 0}%`}
              />
              <KpiCard
                label="Auto reject %"
                value={`${health?.autonomousDecision?.autoRejectPct ?? 0}%`}
              />
              <KpiCard
                label="Autonomous %"
                value={`${health?.autonomousDecision?.autonomousPct ?? 0}%`}
              />
              <KpiCard
                label="Confidence promedio"
                value={String(health?.autonomousDecision?.avgConfidence ?? 0)}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard
                label="Score promedio"
                value={
                  health?.autonomousDecision?.avgScore == null
                    ? '—'
                    : String(health.autonomousDecision.avgScore)
                }
              />
              <KpiCard
                label="Ciclo actual eval"
                value={String(health?.autonomousDecision?.currentCycle?.evaluated ?? 0)}
              />
              <KpiCard
                label="Ciclo actual autónomo"
                value={`${health?.autonomousDecision?.currentCycle?.autonomousPct ?? 0}%`}
              />
              <KpiCard
                label="Ciclo previo autónomo"
                value={`${health?.autonomousDecision?.lastCycle?.autonomousPct ?? 0}%`}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="AUTO_APPROVE" value={String(health?.autonomousDecision?.autoApprove ?? 0)} />
              <KpiCard label="HUMAN_REVIEW" value={String(health?.autonomousDecision?.humanReview ?? 0)} />
              <KpiCard label="AUTO_REJECT" value={String(health?.autonomousDecision?.autoReject ?? 0)} />
              <KpiCard
                label="Verifier auto"
                value={String(health?.autonomousDecision?.verifier?.autoApprove ?? health?.dealVerifier?.autoApproved ?? 0)}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
              <KpiCard label="dup pass" value={String(health?.autonomousDecision?.duplicatePass ?? 0)} />
              <KpiCard label="dup fail" value={String(health?.autonomousDecision?.duplicateFail ?? 0)} />
              <KpiCard label="dup unknown" value={String(health?.autonomousDecision?.duplicateUnknown ?? 0)} />
              <KpiCard label="imagen ok" value={String(health?.autonomousDecision?.imageFound ?? 0)} />
              <KpiCard label="imagen missing" value={String(health?.autonomousDecision?.imageMissing ?? 0)} />
            </div>
            <p className="mt-3 text-xs text-white/35">
              Found (DB) ≠ Evaluados shadow (este isolate). Autonomous % = AUTO_APPROVE + AUTO_REJECT.
              Primera/última decisión:{' '}
              {health?.autonomousDecision?.firstAt
                ? new Date(health.autonomousDecision.firstAt).toLocaleString('es-MX')
                : '—'}
              {' → '}
              {health?.autonomousDecision?.lastAt
                ? new Date(health.autonomousDecision.lastAt).toLocaleString('es-MX')
                : '—'}
              {health?.autonomousDecision?.currentCycle?.evaluated
                ? ` · Ciclo actual: ${health.autonomousDecision.currentCycle.evaluated} eval, autónomo ${health.autonomousDecision.currentCycle.autonomousPct}%`
                : ''}
              {health?.autonomousDecision?.lastCycle?.evaluated
                ? ` · Ciclo previo: ${health.autonomousDecision.lastCycle.evaluated} eval, autónomo ${health.autonomousDecision.lastCycle.autonomousPct}%`
                : ''}
            </p>
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Bottlenecks"
              subtitle="Causas agrupadas de HUMAN_REVIEW. Códigos estables. No cambia publicación."
            />
            {(health?.autonomousDecision?.topReasons?.length ?? 0) > 0 ? (
              <ul className="mt-4 space-y-1.5">
                {health!.autonomousDecision!.topReasons.map((r) => (
                  <li key={r.code ?? r.reason} className="text-xs text-white/50">
                    <span className="text-white/70">×{r.count}</span>{' '}
                    <span className="font-mono text-white/65">{r.code ?? r.reason}</span>
                    {r.label ? <span className="text-white/40"> — {r.label}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-white/40">
                Aún sin HUMAN_REVIEW en este proceso. Corre un ciclo para observar.
              </p>
            )}
            {(health?.autonomousDecision?.recent?.length ?? 0) > 0 ? (
              <ul className="mt-4 space-y-1.5 border-t border-white/[0.06] pt-3">
                {health!.autonomousDecision!.recent!.slice(-8).reverse().map((row, i) => (
                  <li key={`${row.at}-${i}`} className="text-xs text-white/45">
                    <span className="text-white/70">{row.decision}</span>
                    {' · '}
                    {row.source}
                    {' · c '}
                    {row.confidence}
                    {row.score != null ? ` · s ${row.score}` : ''}
                    {row.reasons.length > 0 ? ` · ${row.reasons.join(', ')}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Calibration Data"
              subtitle="Recolección real shadow → offer → human. No backfill. No cambia policy. Pending no es reject."
            />
            {calibration?.collection ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiCard label="Shadow snapshots" value={String(calibration.collection.shadowSnapshots)} />
                  <KpiCard label="Human outcomes" value={String(
                    calibration.collection.approvedOutcomes +
                      calibration.collection.rejectedOutcomes +
                      calibration.collection.snoozedOutcomes +
                      calibration.collection.expiredOutcomes,
                  )} />
                  <KpiCard label="Matched" value={String(calibration.collection.matched)} />
                  <KpiCard label="Match rate" value={calibration.collection.matchRate.display} />
                  <KpiCard label="Awaiting" value={String(calibration.collection.awaitingOutcomes)} />
                  <KpiCard label="Unknown" value={String(calibration.collection.unknown)} />
                  <KpiCard
                    label="Last snapshot"
                    value={
                      calibration.collection.lastShadowSnapshotAt
                        ? new Date(calibration.collection.lastShadowSnapshotAt).toLocaleString('es-MX')
                        : '—'
                    }
                  />
                  <KpiCard
                    label="Last human"
                    value={
                      calibration.collection.lastHumanOutcomeAt
                        ? new Date(calibration.collection.lastHumanOutcomeAt).toLocaleString('es-MX')
                        : '—'
                    }
                  />
                </div>
                <p className="mt-3 text-sm text-white/80">
                  Data collection status:{' '}
                  <span className="font-mono text-white">{calibration.collection.status}</span>
                  {' · sufficiency '}
                  {calibration.collection.sufficiency.toUpperCase()}
                </p>
                {calibration.collection.byDecision.length > 0 ? (
                  <ul className="mt-3 space-y-1 text-xs text-white/45">
                    {calibration.collection.byDecision.map((row) => (
                      <li key={row.decision}>
                        {row.decision}: snap {row.snapshots} · matched {row.matched} · +{row.approved} −
                        {row.rejected} · pending {row.pending} · unk {row.unknown}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-white/40">
                    Sin snapshots todavía. Los ciclos históricos no se correlacionan.
                  </p>
                )}
                {calibration.collection.bySource.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-white/45">
                    {calibration.collection.bySource.map((row) => (
                      <li key={row.sourceId}>
                        {row.sourceId} ({row.sourceLane}): snap {row.snapshots} · matched {row.matched} · +
                        {row.approved} −{row.rejected} · pending {row.pending} · {row.matchRate.display}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(calibration.collection.alerts.noNewShadowSnapshots ||
                  calibration.collection.alerts.noHumanOutcomes ||
                  calibration.collection.alerts.dbWriteFailures) && (
                  <p className="mt-3 text-xs text-amber-200/80">
                    Alert-ready:{' '}
                    {[
                      calibration.collection.alerts.noNewShadowSnapshots ? 'no_new_shadow_snapshots' : null,
                      calibration.collection.alerts.noHumanOutcomes ? 'no_human_outcomes' : null,
                      calibration.collection.alerts.dbWriteFailures ? 'db_write_failures' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">Sin recolección persistida.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Autonomous Calibration"
              subtitle="¿Cuando Shadow dice AUTO_APPROVE, el humano aprueba? Persistido en hunter_shadow_outcomes. No publica. No cambia policy. UNKNOWN si no hay identidad fiable."
            />
            {calibration ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KpiCard label="Shadow evaluados" value={String(calibration.counts.shadowEvaluated)} />
                  <KpiCard label="Matched humano" value={String(calibration.counts.shadowMatched)} />
                  <KpiCard label="Unknown / pending" value={String(calibration.counts.shadowUnknown)} />
                  <KpiCard label="Agreement" value={calibration.agreementRate.display} />
                  <KpiCard label="AUTO_APPROVE precision" value={calibration.autoApprovePrecision.display} />
                  <KpiCard label="AUTO_REJECT precision" value={calibration.autoRejectPrecision.display} />
                  <KpiCard label="Review → approve" value={calibration.reviewApprovalRate.display} />
                  <KpiCard label="Review → reject" value={calibration.reviewRejectRate.display} />
                </div>
                <p className="mt-3 text-sm text-white/80">{calibration.recommendedAction}</p>
                <p className="mt-1 text-xs text-white/35">
                  Policy <span className="font-mono">{calibration.policyVersion}</span>
                  {' · disagreement '}
                  {calibration.disagreementRate.display}
                  {' · n matched '}
                  {calibration.counts.shadowMatched}
                </p>
                <p className="mt-3 text-xs uppercase tracking-wide text-white/40">Top disagreement reasons</p>
                {calibration.disagreementReasons.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 text-xs text-white/45">
                    {calibration.disagreementReasons.slice(0, 8).map((row) => (
                      <li key={`${row.pair}-${row.reasonCode}`}>
                        <span className="text-white/70">×{row.count}</span>{' '}
                        <span className="font-mono">{row.reasonCode}</span>
                        <span className="text-white/35"> · {row.pair}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-white/40">
                    Sin razones de desacuerdo persistidas. El histórico anterior a FASE 11 no se reconstruye.
                  </p>
                )}
                <p className="mt-3 text-xs uppercase tracking-wide text-white/40">Source performance</p>
                {calibration.bySource.length > 0 ? (
                  <ul className="mt-2 space-y-1.5 text-xs text-white/45">
                    {calibration.bySource.map((row) => (
                      <li key={row.sourceId}>
                        {row.sourceId} ({row.sourceFamily}): eval {row.shadowEvaluated} · matched{' '}
                        {row.shadowMatched} · agree {row.agreementRate.display} · AA{' '}
                        {row.autoApprovePrecision.display} · AR {row.autoRejectPrecision.display} · review+{' '}
                        {row.reviewApprovalRate.display}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-white/40">Sin filas por source todavía.</p>
                )}
                <p className="mt-3 text-xs uppercase tracking-wide text-white/40">Score calibration</p>
                {calibration.scoreBuckets.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-white/45">
                    {calibration.scoreBuckets.map((row) => (
                      <li key={row.bucket}>
                        {row.bucket}: eval {row.evaluated} · matched {row.matched} · agree {row.agreementRate.display}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-white/40">Sin buckets de score.</p>
                )}
                <p className="mt-3 text-xs uppercase tracking-wide text-white/40">Confidence calibration</p>
                {calibration.confidenceBuckets.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-white/45">
                    {calibration.confidenceBuckets.map((row) => (
                      <li key={row.bucket}>
                        {row.bucket}: eval {row.evaluated} · matched {row.matched} · agree {row.agreementRate.display}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-white/40">Sin buckets de confidence.</p>
                )}
                <p className="mt-3 text-xs text-white/35">
                  Data sufficiency: n&lt;20 insufficient · 20–49 early · 50–99 moderate · 100+ usable. No es
                  estadística científica.
                </p>
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">
                Sin calibración persistida. Se escribe al insertar una oferta con decisión shadow y se completa
                cuando un humano modera.
              </p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader title="Shadow by source" subtitle="Decisiones shadow agrupadas por fuente Hunter" />
            <ul className="mt-4 space-y-2">
              {SOURCE_HEALTH_ORDER.map((sourceId) => {
                const row = health?.autonomousDecision?.bySource?.[sourceId];
                return (
                  <li
                    key={sourceId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-xs text-white/50"
                  >
                    <span className="text-white/80">{nameById.get(sourceId) ?? sourceId}</span>
                    <span>
                      eval {row?.evaluated ?? 0} · AA {row?.autoApprove ?? 0} · HR {row?.humanReview ?? 0} · AR{' '}
                      {row?.autoReject ?? 0}
                    </span>
                  </li>
                );
              })}
            </ul>
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Mercado Libre quality"
              subtitle="Resolución de URL, API como fuente principal e imágenes oficiales del item. Universo separado de shadow."
            />
            {mlQuality ? (
              <>
                <div className="mt-3 flex flex-wrap gap-3">
                  <KpiCard label="API" value={mlQuality.apiHealth.toUpperCase()} />
                  <KpiCard label="URL resueltas" value={`${mlQuality.urlResolutionPct}%`} />
                  <KpiCard label="Imágenes" value={`${mlQuality.imageQualityPct}%`} />
                  <KpiCard label="Precio" value={`${mlQuality.priceResolutionPct}%`} />
                  <KpiCard label="Affiliate ready" value={`${mlQuality.affiliateReadinessPct}%`} />
                  <KpiCard label="Prom. fotos" value={String(mlQuality.averageValidImages)} />
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/45">
                  <span>urls {mlQuality.urlsReceived}</span>
                  <span>resolved {mlQuality.urlsResolved}</span>
                  <span>api ok {mlQuality.apiSuccess}</span>
                  <span>401 {mlQuality.api401}</span>
                  <span>403 {mlQuality.api403}</span>
                  <span>timeout {mlQuality.apiTimeout}</span>
                  <span>html fb {mlQuality.htmlFallback}</span>
                  <span>img api {mlQuality.imagesApi}</span>
                  <span>img fb {mlQuality.imagesFallback}</span>
                  <span>rejected {mlQuality.imagesRejected}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/45">
                  <span>price req {mlQuality.mlPriceRequests}</span>
                  <span>price ok {mlQuality.mlPriceResolved}</span>
                  <span>price miss {mlQuality.mlPriceUnavailable}</span>
                  <span>price 403 {mlQuality.mlPrice403}</span>
                  <span>price fb {mlQuality.mlPriceFallback}</span>
                  {Object.entries(mlQuality.mlPriceSourceBreakdown ?? {}).map(([src, n]) => (
                    <span key={src}>
                      {src} {n}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">Sin datos ML quality en este isolate.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Day-to-Day supply"
              subtitle="Retailers non-affiliate. Qualification ≠ Autonomous. Flags OFF por defecto. Walmart/Bodega: anti-bot sin bypass."
            />
            {dayToDay ? (
              <>
                <p className="mt-3 text-sm text-white/80">{dayToDay.recommendation}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/45">
                  <span>candidatos {dayToDay.candidates}</span>
                  <span>nuevas {dayToDay.inserted}</span>
                  <span>dup {dayToDay.duplicates}</span>
                  <span>skip {dayToDay.skipped}</span>
                  <span>err {dayToDay.errors}</span>
                  <span>sin config {dayToDay.sourcesNotConfigured}</span>
                </div>
                {dealQualification ? (
                  <div className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                    <p className="text-xs uppercase tracking-wide text-white/35">
                      Deal qualification (supply, no shadow)
                    </p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/45">
                      <span>evaluados {dealQualification.candidatesEvaluated}</span>
                      <span>verified {dealQualification.verifiedDeals}</span>
                      <span>promo {dealQualification.promotions}</span>
                      <span>potential {dealQualification.potentialDeals}</span>
                      <span>catálogo {dealQualification.noVerifiedDeals}</span>
                      <span>verified {dealQualification.verifiedDealPct}%</span>
                      <span>catálogo {dealQualification.catalogOnlyPct}%</span>
                    </div>
                    {dealQualification.topRejectionReasons.length > 0 ? (
                      <p className="mt-2 text-xs text-white/40">
                        Top skip:{' '}
                        {dealQualification.topRejectionReasons
                          .map((r) => `${r.reason} ${r.count}`)
                          .join(' · ')}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/35">
                      {['chedraui_mx', 'bodega_aurrera_mx', 'walmart_mx'].map((id) => {
                        const row = dealQualification.bySource[id];
                        if (!row) return null;
                        return (
                          <span key={id}>
                            {id.replace('_mx', '')} ev {row.evaluated} / v {row.verifiedDeals} / p{' '}
                            {row.promotions} / cat {row.noVerifiedDeals}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {surfaceDiscovery && surfaceDiscovery.length > 0 ? (
                  <div className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                    <p className="text-xs uppercase tracking-wide text-white/35">
                      Surface discovery (no source health, no shadow)
                    </p>
                    <ul className="mt-2 space-y-1 text-xs text-white/45">
                      {surfaceDiscovery.map((row) => (
                        <li key={row.surfaceId}>
                          {row.surfaceId}: req {row.requests} / prod {row.products} / v{' '}
                          {row.verifiedDeals} / promo {row.promotions} / cat {row.catalogOnly} / ev{' '}
                          {row.evidenceQuality}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <ul className="mt-4 space-y-2">
                  {dayToDay.sources.map((src) => (
                    <li
                      key={src.id}
                      className="flex flex-col gap-1 rounded-xl bg-white/[0.03] px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm text-white/85">{src.displayName}</p>
                        <p className="text-xs text-white/40">
                          {src.id}
                          {src.breakerState ? ` · breaker ${src.breakerState}` : ''}
                          {src.lastErrorCode ? ` · ${src.lastErrorCode}` : ''}
                          {src.lastRunAt
                            ? ` · última ${new Date(src.lastRunAt).toLocaleString('es-MX')}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-white/45">
                        <StatusBadge
                          tone={src.configuration === 'not_configured' ? 'neutral' : 'attention'}
                        >
                          {src.configuration === 'not_configured'
                            ? 'NOT CONFIGURED'
                            : src.configuration.toUpperCase()}
                        </StatusBadge>
                        <span>monetización {src.affiliateStatus}</span>
                        <span>found {src.itemsFound}</span>
                        <span>ins {src.itemsInserted}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-3 text-xs text-white/40">Sin datos Day-to-Day.</p>
            )}
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Enrichment"
              subtitle="Completitud del snapshot. Mismo isolate que ingest — 0 en este panel es esperado si ml_worker corrió en otra función serverless."
            />
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Candidatos" value={String(health?.hunterEnrichment?.candidatesFound ?? 0)} />
              <KpiCard label="Con imagen" value={String(health?.hunterEnrichment?.imageFound ?? 0)} />
              <KpiCard label="Sin imagen" value={String(health?.hunterEnrichment?.imageMissing ?? 0)} />
              <KpiCard
                label="% imagen"
                value={`${health?.hunterEnrichment?.completePct ?? 0}%`}
              />
              <KpiCard label="Enriquecidos" value={String(health?.hunterEnrichment?.enriched ?? 0)} />
              <KpiCard label="Fallos" value={String(health?.hunterEnrichment?.enrichmentFailed ?? 0)} />
              <KpiCard
                label="% completos"
                value={`${health?.hunterEnrichment?.fullyCompletePct ?? 0}%`}
              />
              <KpiCard label="Con título" value={String(health?.hunterEnrichment?.titleFound ?? 0)} />
            </div>
          </GlassCard>

          <GlassCard>
            <SectionHeader
              title="Deal Verifier"
              subtitle="Decisión productiva del verifier (no es el motor shadow). Memoria de proceso."
            />
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiCard label="Evaluados" value={String(health?.dealVerifier?.evaluated ?? 0)} />
              <KpiCard label="Auto-approved" value={String(health?.dealVerifier?.autoApproved ?? 0)} />
              <KpiCard label="Review" value={String(health?.dealVerifier?.review ?? 0)} />
              <KpiCard label="Rejected" value={String(health?.dealVerifier?.rejected ?? 0)} />
            </div>
          </GlassCard>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Publicadas hoy" value={String(data.capacity.inserted_today_approx ?? '—')} />
            <KpiCard label="Pendientes de revisión" value={String(data.offers.pending_count ?? '—')} />
            <KpiCard
              label="Auto-publicar desde"
              value={
                data.config.auto_approve_enabled ? `${data.config.auto_approve_min_score ?? '—'}` : 'Off'
              }
            />
            <KpiCard label="Descartar bajo" value={String(data.config.reject_below_score ?? '—')} />
          </div>

          <GlassCard>
            <SectionHeader title="Últimos hallazgos" subtitle="Lo que el publisher acaba de insertar" />
            {data.offers.recent.length === 0 ? (
              <p className="mt-4 text-sm text-white/40">Aún no hay ofertas del cazador.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {data.offers.recent.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white/85">{o.title}</p>
                      <p className="text-xs text-white/40">
                        {o.store ?? 'Tienda'} · ${o.price.toLocaleString('es-MX')}
                      </p>
                    </div>
                    <StatusBadge
                      tone={o.status === 'approved' ? 'ok' : o.status === 'pending' ? 'attention' : 'neutral'}
                    >
                      {o.status}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        </>
      ) : null}

      <GlassCard>
        <SectionHeader
          title="Sistemas del Cazador"
          subtitle="Así se construye: módulos encima del ingest actual, no otro producto"
        />
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {HUNTER_MODULES.map((m) => (
            <li key={m.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-white/90">
                  {m.emoji} {m.name}
                </p>
                <StatusBadge tone={MODULE_TONE[m.status]}>{MODULE_LABEL[m.status]}</StatusBadge>
              </div>
              <p className="mt-1.5 text-xs text-white/45 leading-relaxed">{m.job}</p>
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}
