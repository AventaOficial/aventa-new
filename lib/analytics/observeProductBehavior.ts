import { cookies } from 'next/headers';
import { ANONYMOUS_ID_COOKIE, issueAnonymousId, readAnonymousId, type AnonymousCookieOptions } from '@/lib/analytics/anonymousIdentity';
import {
  buildSearchMetadata,
  feedViewMetadata,
  loadMoreMetadata,
} from '@/lib/analytics/productEventContract';
import { recordProductEvent } from '@/lib/analytics/recordProductEvent';
import { captureRequestAuth, userIdFromCapturedAuth } from '@/lib/analytics/requestUser';
import { scheduleProductEvent } from '@/lib/analytics/scheduleProductEvent';

function countItems(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const body = payload as { data?: unknown; offers?: unknown };
  if (Array.isArray(body.data)) return body.data.length;
  if (Array.isArray(body.offers)) return body.offers.length;
  return null;
}

async function captureAnonymousId(): Promise<{ anonymousId: string | null; cookieList: { name: string; value: string }[] }> {
  const jar = await cookies();
  const existing = readAnonymousId(jar.get(ANONYMOUS_ID_COOKIE)?.value);
  let anonymousId = existing;
  if (!anonymousId) {
    try {
      const writable = jar as unknown as {
        set(name: string, value: string, options: AnonymousCookieOptions): void;
      };
      anonymousId = issueAnonymousId(
        (name) => jar.get(name)?.value,
        (name, value, options) => writable.set(name, value, options),
      );
    } catch {
      anonymousId = null;
    }
  }
  return { anonymousId, cookieList: jar.getAll() };
}

/** feed_view en la primera página. load_more cuando hay cursor. No bloquea la respuesta. */
export async function observeFeedRequest(
  request: Request,
  input: {
    feedType: 'home' | 'for_you';
    cursor?: string | null;
    view?: string | null;
    period?: string | null;
    category?: string | null;
    store?: string | null;
    resultCount?: number | null;
    payload?: unknown;
    userId?: string | null;
    source: string;
  },
): Promise<void> {
  try {
  const { anonymousId, cookieList } = await captureAnonymousId();
  const auth = captureRequestAuth(request, cookieList);
  const knownUserId = input.userId?.trim() || null;
  const resultCount = input.resultCount ?? countItems(input.payload);
  const cursor = input.cursor?.trim() || '';

  scheduleProductEvent(async () => {
    const userId = knownUserId ?? (await userIdFromCapturedAuth(auth));
    if (cursor) {
      const metadata = loadMoreMetadata({
        feedType: input.feedType,
        cursor,
        view: input.view,
        period: input.period,
      });
      if (!metadata) return;
      await recordProductEvent({
        event: 'load_more',
        userId,
        anonymousId,
        source: input.source,
        metadata,
      });
      return;
    }
    await recordProductEvent({
      event: 'feed_view',
      userId,
      anonymousId,
      source: input.source,
      metadata: feedViewMetadata({
        feedType: input.feedType,
        view: input.view,
        period: input.period,
        category: input.category,
        store: input.store,
        resultCount,
      }),
    });
  });
  } catch (error) {
    console.error('[product-event] feed observer skipped', error instanceof Error ? error.name : 'error');
  }
}

/** search distinto por query normalizada. No guarda payload ni headers. */
export async function observeSearchRequest(request: Request, rawQuery: string, resultCount: number): Promise<void> {
  try {
    const metadata = buildSearchMetadata(rawQuery, resultCount);
    if (!metadata) return;
    const { anonymousId, cookieList } = await captureAnonymousId();
    const auth = captureRequestAuth(request, cookieList);
    scheduleProductEvent(async () => {
      const userId = await userIdFromCapturedAuth(auth);
      await recordProductEvent({
        event: 'search',
        userId,
        anonymousId,
        source: 'api/search/offers',
        metadata,
      });
    });
  } catch (error) {
    console.error('[product-event] search observer skipped', error instanceof Error ? error.name : 'error');
  }
}
