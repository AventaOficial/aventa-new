import { createClient } from '@/lib/supabase/client'

export type VoteMap = Record<string, 1 | -1>
/** Valor guardado en offer_votes (ej. 2, 4, -1, -2) para optimismo del score. */
export type VoteValueMap = Record<string, number>
export type FavoriteMap = Record<string, boolean>

export async function fetchBatchUserData(
  userId: string,
  offerIds: string[]
): Promise<{ voteMap: VoteMap; voteValueMap: VoteValueMap; favoriteMap: FavoriteMap }> {
  if (offerIds.length === 0) {
    return { voteMap: {}, voteValueMap: {}, favoriteMap: {} }
  }

  const supabase = createClient()

  const [votesRes, favoritesRes] = await Promise.all([
    supabase
      .from('offer_votes')
      .select('offer_id, value')
      .eq('user_id', userId)
      .in('offer_id', offerIds),
    supabase
      .from('offer_favorites')
      .select('offer_id')
      .eq('user_id', userId)
      .in('offer_id', offerIds),
  ])

  const voteMap: VoteMap = {}
  const voteValueMap: VoteValueMap = {}
  for (const row of votesRes.data ?? []) {
    const val = row.value as number
    voteValueMap[row.offer_id] = val
    if (val > 0) voteMap[row.offer_id] = 1
    else if (val < 0) voteMap[row.offer_id] = -1
  }

  const favoriteMap: FavoriteMap = {}
  for (const row of favoritesRes.data ?? []) {
    favoriteMap[row.offer_id] = true
  }

  return { voteMap, voteValueMap, favoriteMap }
}
