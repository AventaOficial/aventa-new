import { offerMatchesAffinity, type UserAffinitySignals } from '@/lib/preferences/affinity';

/** Ofertas recientes que encajan con gustos inferidos (likes/votos/categorías), fuera del top global por votos. */
export const FOR_YOU_AFFINITY_RECENT_LIMIT = 150;

export function mergeForYouAffinityCandidates<
  T extends { id: string; category?: string | null; store?: string | null },
>(topByRanking: readonly T[], recentRows: readonly T[], affinity: UserAffinitySignals): T[] {
  const byId = new Map(topByRanking.map((row) => [row.id, row]));
  for (const row of recentRows) {
    if (!byId.has(row.id) && offerMatchesAffinity(row, affinity)) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}
