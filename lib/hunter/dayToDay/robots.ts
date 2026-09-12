/**
 * Robots path check determinista (prefix Disallow).
 * No ejecuta crawler completo de robots — suficiente para seeds allowlisted.
 */
export type RobotsRules = {
  disallows: string[];
  allows: string[];
  sitemaps: string[];
  crawlDelaySeconds: number | null;
};

export function parseRobotsTxt(text: string): RobotsRules {
  const disallows: string[] = [];
  const allows: string[] = [];
  const sitemaps: string[] = [];
  let crawlDelaySeconds: number | null = null;
  let inStar = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith('user-agent:')) {
      const ua = line.slice('user-agent:'.length).trim();
      inStar = ua === '*';
      continue;
    }
    if (lower.startsWith('sitemap:')) {
      sitemaps.push(line.slice('sitemap:'.length).trim());
      continue;
    }
    if (!inStar) continue;
    if (lower.startsWith('disallow:')) {
      const v = line.slice('disallow:'.length).trim();
      if (v) disallows.push(v);
    } else if (lower.startsWith('allow:')) {
      const v = line.slice('allow:'.length).trim();
      if (v) allows.push(v);
    } else if (lower.startsWith('crawl-delay:')) {
      const n = Number(line.slice('crawl-delay:'.length).trim());
      if (Number.isFinite(n) && n > 0) crawlDelaySeconds = n;
    }
  }
  return { disallows, allows, sitemaps, crawlDelaySeconds };
}

function pathMatchesRule(pathname: string, rule: string): boolean {
  if (rule === '/') return true;
  // Treat trailing * as prefix wildcard for our limited use.
  const prefix = rule.endsWith('*') ? rule.slice(0, -1) : rule;
  return pathname.startsWith(prefix);
}

/** true = permitido para User-agent: * */
export function isPathAllowedByRobots(pathname: string, rules: RobotsRules): boolean {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  let disallowed = false;
  for (const d of rules.disallows) {
    if (pathMatchesRule(path, d)) disallowed = true;
  }
  for (const a of rules.allows) {
    if (pathMatchesRule(path, a)) {
      // Specific allow can reopen a path; keep simple: allow wins if matched.
      if (a.length >= 1) return true;
    }
  }
  return !disallowed;
}

export function isUrlAllowedByRobots(rawUrl: string, rules: RobotsRules): boolean {
  try {
    const u = new URL(rawUrl);
    return isPathAllowedByRobots(u.pathname + (u.search || ''), rules);
  } catch {
    return false;
  }
}
