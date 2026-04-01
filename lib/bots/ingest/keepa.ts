type KeepaProduct = {
  stats?: {
    current?: number[];
    min?: number[];
    minInInterval?: number[];
  };
};

type KeepaResponse = {
  products?: KeepaProduct[];
};

export type KeepaPriceIntel = {
  lowest30d: number | null;
  lowest90d: number | null;
  current: number | null;
  priceVsLowest90dPct: number | null;
};

function keepaCentsToCurrency(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Number((value / 100).toFixed(2));
}

export async function fetchKeepaPriceIntel(args: {
  apiKey: string | null;
  domainId: number;
  asin: string;
}): Promise<KeepaPriceIntel | null> {
  if (!args.apiKey || !args.asin) return null;
  const url = new URL('https://api.keepa.com/product');
  url.searchParams.set('key', args.apiKey);
  url.searchParams.set('domain', String(args.domainId));
  url.searchParams.set('asin', args.asin);
  url.searchParams.set('stats', '90');

  let res: Response;
  try {
    res = await fetch(url.href, { cache: 'no-store' });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  let json: KeepaResponse;
  try {
    json = (await res.json()) as KeepaResponse;
  } catch {
    return null;
  }

  const product = json.products?.[0];
  if (!product?.stats) return null;

  const current = keepaCentsToCurrency(product.stats.current?.[1] ?? null);
  const lowest90d = keepaCentsToCurrency(
    product.stats.min?.[1] ?? product.stats.minInInterval?.[1] ?? null
  );
  const lowest30d = keepaCentsToCurrency(product.stats.minInInterval?.[1] ?? null);
  const priceVsLowest90dPct =
    current != null && lowest90d != null && lowest90d > 0
      ? Number((((current - lowest90d) / lowest90d) * 100).toFixed(1))
      : null;

  return {
    lowest30d,
    lowest90d,
    current,
    priceVsLowest90dPct,
  };
}
