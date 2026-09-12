import { gunzipSync } from 'zlib';
import { BOT_INGEST_USER_AGENT } from '../lib/bots/ingest/ingestHttp';
import { extractSitemapLocs } from '../lib/hunter/dayToDay/fetchPublic';

async function fetchMaybeGzip(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/xml,text/xml,application/gzip,*/*;q=0.8',
      'User-Agent': BOT_INGEST_USER_AGENT,
      'Accept-Language': 'es-MX,es;q=0.9',
    },
    redirect: 'follow',
    cache: 'no-store',
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const gzip = buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  const text = gzip ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  return { status: res.status, gzip, len: text.length, locs: extractSitemapLocs(text) };
}

async function main() {
  const landings = await fetchMaybeGzip('https://www.homedepot.com.mx/sitemap-landings.xml');
  const shard = await fetchMaybeGzip('https://www.homedepot.com.mx/sitemap_10351_1.xml.gz');
  const promoish = shard.locs.filter((u) =>
    /oferta|promo|descuento|liquidaci|sale|2x1|3x2/i.test(u),
  );
  console.log(
    JSON.stringify(
      {
        landings: {
          status: landings.status,
          gzip: landings.gzip,
          n: landings.locs.length,
          sample: landings.locs.slice(0, 15),
        },
        shard1: {
          status: shard.status,
          gzip: shard.gzip,
          n: shard.locs.length,
          sample: shard.locs.slice(0, 12),
          promoish: promoish.slice(0, 12),
          promoishCount: promoish.length,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
