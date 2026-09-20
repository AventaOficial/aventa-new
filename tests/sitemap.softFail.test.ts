import { afterEach, describe, expect, it } from 'vitest';
import { getOffersCount, getSitemapOffers, getSitemapStores } from '@/lib/sitemap';

const PREV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PREV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

afterEach(() => {
  if (PREV_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = PREV_URL;
  if (PREV_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = PREV_KEY;
});

describe('sitemap soft-fail without Supabase secrets', () => {
  it('returns empty dynamic segments when env is missing (build/prerender)', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    await expect(getSitemapStores()).resolves.toEqual([]);
    await expect(getSitemapOffers()).resolves.toEqual([]);
    await expect(getOffersCount()).resolves.toBe(0);
  });
});
