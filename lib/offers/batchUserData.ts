import { createClient } from '@/lib/supabase/client'

export type VoteMap = Record<string, 1 | -1>
export type FavoriteMap = Record<string, boolean>

export async function fetchBatchUserData(
  userId: string,
  offerIds: string[]
): Promise<{ voteMap: VoteMap; favoriteMap: FavoriteMap }> {
  if (offerIds.length === 0) {
    return { voteMap: {}, favoriteMap: {} }
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
  for (const row of votesRes.data ?? []) {
    const val = row.value
    if (val === 1 || val === -1) {
      voteMap[row.offer_id] = val
    }
  }

  const favoriteMap: FavoriteMap = {}
  for (const row of favoritesRes.data ?? []) {
    favoriteMap[row.offer_id] = true
  }

  return { voteMap, favoriteMap }
}
