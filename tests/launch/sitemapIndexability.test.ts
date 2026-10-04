import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const offers = [
  { id: '11111111-1111-4111-8111-111111111111', title: 'Bot wall', created_at: '2026-10-01T00:00:00Z' },
  { id: '22222222-2222-4222-8222-222222222222', title: 'Gone', created_at: '2026-10-01T00:00:00Z' },
  { id: '33333333-3333-4333-8333-333333333333', title: 'Healthy', created_at: '2026-10-01T00:00:00Z' },
];
const health = [
  { offer_id: offers[0].id, diagnostic: 'missing_title' },
  { offer_id: offers[1].id, diagnostic: 'http_404|https://www.amazon.com.mx/dp/X' },
];

function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'or', 'order']) q[m] = () => q;
  q.range = () => Promise.resolve({ data: result });
  q.limit = () => Promise.resolve({ data: result });
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: () => ({
    from: (table: string) => chain(table === 'offers' ? offers : health),
  }),
}));

const PREV_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PREV_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
});

afterEach(() => {
  if (PREV_URL === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = PREV_URL;
  if (PREV_KEY === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = PREV_KEY;
});

describe('sitemap offer indexability', () => {
  it('drops only offers confirmed gone by 404/410, like the offer page robots', async () => {
    const { getSitemapOffers } = await import('@/lib/sitemap');
    const urls = (await getSitemapOffers()).map((u) => u.url);
    expect(urls.some((u) => u.includes(offers[0].id))).toBe(true);
    expect(urls.some((u) => u.includes(offers[1].id))).toBe(false);
    expect(urls.some((u) => u.includes(offers[2].id))).toBe(true);
  });
});
