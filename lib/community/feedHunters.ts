import { publicProfilePath } from '@/lib/profileSlug';

type FeedAuthor = {
  username: string;
  avatar_url?: string | null;
  leaderBadge?: string | null;
  userId?: string | null;
  slug?: string | null;
};

export type FeedHunter = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  leaderBadge: string | null;
  profilePath: string | null;
  /** Ofertas suyas en el feed que el usuario está viendo. */
  offers: number;
};

/**
 * Cazadores con ofertas en el feed actual, sin pedir datos nuevos al servidor.
 * Excluye autores sin cuenta (bots, ofertas de prueba) y ordena por ofertas publicadas.
 */
export function activeHuntersFromFeed(
  offers: readonly { id: string; author?: FeedAuthor | null }[],
  limit = 3,
): FeedHunter[] {
  const byUser = new Map<string, FeedHunter>();
  for (const offer of offers) {
    const a = offer.author;
    const userId = a?.userId?.trim();
    if (!a || !userId || offer.id.startsWith('tester-')) continue;
    const current = byUser.get(userId);
    if (current) {
      current.offers += 1;
      continue;
    }
    byUser.set(userId, {
      userId,
      name: a.username?.trim() || 'Cazador',
      avatarUrl: a.avatar_url ?? null,
      leaderBadge: a.leaderBadge ?? null,
      profilePath: publicProfilePath(a.username, userId, a.slug ?? null),
      offers: 1,
    });
  }
  return [...byUser.values()]
    .sort((x, y) => y.offers - x.offers || x.name.localeCompare(y.name, 'es'))
    .slice(0, Math.max(0, limit));
}
