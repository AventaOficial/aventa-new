/**
 * Durations only when both timestamps exist and move forward.
 * Missing stages stay null. Nothing here publishes.
 */

export type DealPipelineMarks = {
  discoveredAt?: string | null;
  verifiedAt?: string | null;
  decidedAt?: string | null;
  publishedAt?: string | null;
};

function hoursBetween(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / (60 * 60 * 1000)) * 10000) / 10000;
}

export function pipelineDurations(marks: DealPipelineMarks): {
  timeToVerificationHours: number | null;
  timeToDecisionHours: number | null;
  timeToPublicationHours: number | null;
  autoPublish: false;
} {
  return {
    timeToVerificationHours: hoursBetween(marks.discoveredAt, marks.verifiedAt),
    timeToDecisionHours: hoursBetween(marks.verifiedAt, marks.decidedAt),
    timeToPublicationHours: hoursBetween(marks.decidedAt, marks.publishedAt),
    autoPublish: false,
  };
}
