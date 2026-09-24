const NOISE = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'mc_cid', 'mc_eid'];
const KEEP = new Set(['tag', 'matt_word', 'matt_tool', 'click_id', 'clickid', 'subid', 'sub_id', 'aff_fcid', 'aff_platform', 'aff_id']);

/** Drops campaign noise. Affiliate and click identity parameters stay. */
export function stripTrackingNoise(url: string): { url: string; uncertain: boolean } {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (KEEP.has(key.toLowerCase())) continue;
      if (NOISE.includes(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) parsed.searchParams.delete(key);
    }
    return { url: parsed.toString(), uncertain: false };
  } catch {
    return { url, uncertain: true };
  }
}
