import type { SupabaseClient } from '@supabase/supabase-js';
import { strongProductFingerprintForUrl } from '@/lib/offers/findDuplicateOffer';
import {
  evaluateNegativeMemory,
  loadNegativeMemoryEvents,
} from '@/lib/discovery/negativeMemory';

/**
 * Defense-in-depth: block machine insert when Negative Memory says SUPPRESS.
 * Used by S7 bridge so ml_api / supply paths cannot bypass externalWorker intelligence.
 */
export async function isSuppressedByNegativeMemory(params: {
  supabase: SupabaseClient | null | undefined;
  url: string;
  now?: Date;
}): Promise<{ suppressed: boolean; reason: string | null; fingerprint: string | null }> {
  const fp = strongProductFingerprintForUrl(params.url);
  if (!fp || !params.supabase) {
    return { suppressed: false, reason: null, fingerprint: fp };
  }
  try {
    const events = await loadNegativeMemoryEvents(params.supabase, [fp]);
    const decision = evaluateNegativeMemory({
      fingerprint: fp,
      events: events.get(fp) ?? [],
      now: params.now,
    });
    if (decision.level === 'SUPPRESS') {
      return { suppressed: true, reason: decision.reason, fingerprint: fp };
    }
    return { suppressed: false, reason: null, fingerprint: fp };
  } catch {
    // Fail-open on lookup errors would recirculate spam; fail-closed is safer for machine writes.
    // But DB blips shouldn't kill all inserts — fail-open with telemetry reason.
    return { suppressed: false, reason: 'nm_lookup_failed', fingerprint: fp };
  }
}
