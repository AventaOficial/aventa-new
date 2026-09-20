/**
 * Feature flag: Candidate Intelligence observation persist.
 * Default ON unless explicitly disabled — discovery ≠ publication.
 * Never enables mint / money path.
 */

export function isHunterCandidateIntelligenceEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env.HUNTER_CANDIDATE_INTELLIGENCE ?? '1').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
  return true;
}
