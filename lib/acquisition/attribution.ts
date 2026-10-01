export type AcquisitionAttribution = {
  sourceKey: string;
  sourceType: string;
  scoutId: string | null;
  scoutName: string | null;
  actorUserId: string | null;
  submissionId: string;
  externalRunId: string | null;
  originalUrl: string;
  discoveredAt: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Lee la atribución guardada en evidence.acquisition o en evidence.hunter.acquisition. */
export function readAcquisitionAttribution(evidence: unknown): AcquisitionAttribution | null {
  const root = asRecord(evidence);
  if (!root) return null;
  const direct = asRecord(root.acquisition);
  const hunter = asRecord(root.hunter);
  const nested = hunter ? asRecord(hunter.acquisition) : null;
  const block = direct ?? nested;
  if (!block) return null;
  const sourceKey = block.source_key;
  const submissionId = block.submission_id;
  const originalUrl = block.original_url;
  const discoveredAt = block.discovered_at;
  if (typeof sourceKey !== 'string' || !sourceKey) return null;
  if (typeof submissionId !== 'string' || !submissionId) return null;
  if (typeof originalUrl !== 'string' || !originalUrl) return null;
  if (typeof discoveredAt !== 'string' || !discoveredAt) return null;
  const scoutId = block.scout_id;
  const externalRunId = block.external_run_id;
  const sourceType = block.source_type;
  return {
    sourceKey,
    sourceType: typeof sourceType === 'string' ? sourceType : 'external',
    scoutId: typeof scoutId === 'string' && scoutId ? scoutId : null,
    scoutName: typeof block.scout_name === 'string' && block.scout_name ? block.scout_name : null,
    actorUserId: typeof block.actor_user_id === 'string' && block.actor_user_id ? block.actor_user_id : null,
    submissionId,
    externalRunId: typeof externalRunId === 'string' && externalRunId ? externalRunId : null,
    originalUrl,
    discoveredAt,
  };
}
