import { fetchPublicText, extractSitemapLocs } from '../lib/hunter/dayToDay/fetchPublic';
import { parseRobotsTxt, isUrlAllowedByRobots } from '../lib/hunter/dayToDay/robots';

async function main() {
  const robots = await fetchPublicText('https://www.homedepot.com.mx/robots.txt', 12_000);
  const rules = parseRobotsTxt(robots.text);
  const indexUrl = rules.sitemaps[0] ?? 'https://www.homedepot.com.mx/sitemap.xml';
  const allowed = isUrlAllowedByRobots(indexUrl, rules);
  const index = allowed ? await fetchPublicText(indexUrl, 12_000) : null;
  const locs = index ? extractSitemapLocs(index.text) : [];
  console.log(
    JSON.stringify(
      {
        robotsStatus: robots.status,
        crawlDelay: rules.crawlDelaySeconds,
        disallows: rules.disallows.slice(0, 40),
        allows: rules.allows.slice(0, 20),
        sitemaps: rules.sitemaps,
        indexUrl,
        indexAllowed: allowed,
        indexStatus: index?.status ?? null,
        childCount: locs.length,
        children: locs.slice(0, 40),
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
