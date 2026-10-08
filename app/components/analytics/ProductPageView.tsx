import { cookies, headers } from 'next/headers';
import {
  isPrefetchRequest,
  isPublicProductPath,
  normalizeProductPath,
} from '@/lib/analytics/productEventContract';
import { ANONYMOUS_ID_COOKIE, PRODUCT_PATH_HEADER, readAnonymousId } from '@/lib/analytics/anonymousIdentity';
import { recordProductEvent } from '@/lib/analytics/recordProductEvent';
import { userIdFromCapturedAuth } from '@/lib/analytics/requestUser';
import { scheduleProductEvent } from '@/lib/analytics/scheduleProductEvent';

/**
 * page_view de superficies públicas. El middleware solo reenvía el path;
 * la escritura vive aquí, fuera del bus de auth.
 */
export async function ProductPageView() {
  try {
    const headerStore = await headers();
    if (isPrefetchRequest(headerStore)) return null;
    const path = normalizeProductPath(headerStore.get(PRODUCT_PATH_HEADER));
    if (!path || !isPublicProductPath(path)) return null;

    const jar = await cookies();
    const anonymousId = readAnonymousId(jar.get(ANONYMOUS_ID_COOKIE)?.value);
    const cookieList = jar.getAll();

    scheduleProductEvent(async () => {
      const userId = await userIdFromCapturedAuth({ bearer: null, cookies: cookieList });
      await recordProductEvent({
        event: 'page_view',
        userId,
        anonymousId,
        source: 'document',
        metadata: { path },
      });
    });
  } catch (error) {
    console.error('[product-event] page_view skipped', error instanceof Error ? error.name : 'error');
  }
  return null;
}
