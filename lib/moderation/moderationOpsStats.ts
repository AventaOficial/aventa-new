import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBotIngestConfig } from '@/lib/bots/ingest/config';
import { classifyOfferModerationLevel } from './classifyOfferModerationLevel';
import { getClaimLatencyStats } from './claimLatencyTracker';
import {
  fetchBannedCreatorIds,
  fetchPendingReportOfferIds,
} from './moderationQueueSignals';

const LEVEL_KEYS = ['sprint', 'review', 'enforcement'] as const;

function computeIsBot(
  row: {
    created_by?: string | null;
    moderator_comment?: string | null;
    description?: string | null;
  },
  botIds: Set<string>
): boolean {
  if (row.created_by && botIds.has(row.created_by)) return true;
  if ((row.moderator_comment ?? '').toLowerCase().includes('[bot-ingest]')) return true;
  if ((row.description ?? '').toLowerCase().includes('ingesta automática (bot)')) return true;
  return false;
}

export type ModerationOpsStats = {
  backlog: number;
  oldestPendingAgeSeconds: number | null;
  throughputLastHour: number;
  approvalRateLastHour: number | null;
  medianDecisionSecondsLastHour: number | null;
  levelDistribution: Record<(typeof LEVEL_KEYS)[number], number>;
  claimLatency: ReturnType<typeof getClaimLatencyStats>;
};

export async function buildModerationOpsStats(
  supabase: SupabaseClient,
  sampleLimit = 500
): Promise<ModerationOpsStats> {
  const sinceHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const [{ count: backlog }, { data: oldest }, { data: logs }, { data: pendingSample }] =
    await Promise.all([
      supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase
        .from('offers')
        .select('created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('moderation_logs')
        .select('action, created_at, offer_id')
        .in('action', ['approved', 'rejected'])
        .gte('created_at', sinceHour),
      supabase
        .from('offers')
        .select(
          'id, created_by, risk_score, moderator_comment, image_url, image_urls, offer_url, category, original_price, price, description'
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(sampleLimit),
    ]);

  const oldestCreated = (oldest as { created_at?: string } | null)?.created_at;
  const oldestPendingAgeSeconds = oldestCreated
    ? Math.max(0, Math.round((Date.now() - new Date(oldestCreated).getTime()) / 1000))
    : null;

  const decisionLogs = logs ?? [];
  const approved = decisionLogs.filter((l) => (l as { action?: string }).action === 'approved').length;
  const rejected = decisionLogs.filter((l) => (l as { action?: string }).action === 'rejected').length;
  const throughputLastHour = approved + rejected;
  const approvalRateLastHour =
    throughputLastHour > 0 ? Math.round((approved / throughputLastHour) * 1000) / 10 : null;

  let medianDecisionSecondsLastHour: number | null = null;
  if (decisionLogs.length > 0) {
    const offerIds = [
      ...new Set(
        decisionLogs
          .map((l) => (l as { offer_id?: string }).offer_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const { data: offerRows } = await supabase
      .from('offers')
      .select('id, created_at')
      .in('id', offerIds.slice(0, 200));

    const createdMap = new Map(
      (offerRows ?? []).map((r) => [
        (r as { id: string }).id,
        (r as { created_at: string }).created_at,
      ])
    );

    const durations = decisionLogs
      .map((l) => {
        const offerId = (l as { offer_id?: string }).offer_id;
        const decidedAt = (l as { created_at?: string }).created_at;
        const createdAt = offerId ? createdMap.get(offerId) : null;
        if (!offerId || !decidedAt || !createdAt) return null;
        const sec = (new Date(decidedAt).getTime() - new Date(createdAt).getTime()) / 1000;
        return Number.isFinite(sec) && sec >= 0 ? sec : null;
      })
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);

    if (durations.length > 0) {
      const mid = Math.floor(durations.length / 2);
      medianDecisionSecondsLastHour =
        durations.length % 2 === 0
          ? Math.round((durations[mid - 1]! + durations[mid]!) / 2)
          : Math.round(durations[mid]!);
    }
  }

  const config = loadBotIngestConfig('standard');
  const botIds = new Set(config.botUserIdsForQuota);
  const sample = pendingSample ?? [];
  const sampleIds = sample.map((r) => (r as { id: string }).id);
  const creatorIds = [
    ...new Set(
      sample
        .map((r) => (r as { created_by?: string | null }).created_by)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const [reportedOfferIds, bannedCreatorIds] = await Promise.all([
    fetchPendingReportOfferIds(supabase, sampleIds),
    fetchBannedCreatorIds(supabase, creatorIds),
  ]);

  const levelDistribution = { sprint: 0, review: 0, enforcement: 0 };
  for (const row of sample) {
    const r = row as Record<string, unknown>;
    const createdBy = r.created_by as string | null | undefined;
    const { level } = classifyOfferModerationLevel(
      {
        ...r,
        is_bot: computeIsBot(
          r as { created_by?: string | null; moderator_comment?: string | null; description?: string | null },
          botIds
        ),
      },
      {
        authorBanned: Boolean(createdBy && bannedCreatorIds.has(createdBy)),
        hasPendingReport: reportedOfferIds.has(r.id as string),
      }
    );
    levelDistribution[level] += 1;
  }

  return {
    backlog: backlog ?? 0,
    oldestPendingAgeSeconds,
    throughputLastHour,
    approvalRateLastHour,
    medianDecisionSecondsLastHour,
    levelDistribution,
    claimLatency: getClaimLatencyStats(),
  };
}
