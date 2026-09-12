import { extractSitemapLocs, fetchPublicText } from '../lib/hunter/dayToDay/fetchPublic';
import { isStrictPromoProductUrl } from '../lib/hunter/retailerDiscovery/sitemapSelect';

async function main() {
  const r = await fetchPublicText('https://www.homedepot.com.mx/sitemap_10351_1.xml.gz');
  const locs = extractSitemapLocs(r.text);
  const hits = locs.filter((u) => isStrictPromoProductUrl(u));
  console.log(JSON.stringify({ status: r.status, n: locs.length, hits }, null, 2));
}

main().catch((e) => {
  console.error(String(e));
  process.exit(2);
});
