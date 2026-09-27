import type { SupabaseClient } from '@supabase/supabase-js';
import { findDuplicateOfferByUrl, strongProductFingerprintForUrl } from '@/lib/offers/findDuplicateOffer';
import { inferRetailer } from '@/lib/hunter/candidateIntelligence/buildCandidateRecord';
import {
  DECISION_POLICY_VERSION,
  HUNTER_VERSION,
  NORMALIZATION_VERSION,
  SCORING_VERSION,
} from '@/lib/hunter/candidateIntelligence/versions';
import {
  ACQUISITION_SCOUT_DAILY_CAP,
  type AcquisitionSourceType,
} from './contract';
import {
  acquisitionSubmissionId,
  forbiddenAcquisitionMetadata,
  planAcquisitionUrls,
  scoutDailyRoom,
  type AcquisitionPlanItem,
} from './plan';

export type AcquisitionSourceRow = {
  id: string;
  source_key: string;
  source_type: AcquisitionSourceType;
  display_name: string;
  description: string | null;
  active: boolean;
};

export type AcquisitionScoutRow = {
  id: string;
  source_id: string;
  display_name: string;
  active: boolean;
  created_by: string;
};

export type SubmitAcquisitionInput = {
  supabase: SupabaseClient;
  actorUserId: string;
  sourceKey: string;
  scoutId?: string | null;
  text: string;
  externalRunId?: string | null;
  discoveredAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type SubmitAcquisitionResult =
  | {
      ok: true;
      submissionId: string;
      sourceKey: string;
      scoutId: string | null;
      received: number;
      accepted: number;
      duplicates: number;
      invalid: number;
      overCap: number;
      idempotent: number;
      items: Array<{
        raw: string;
        outcome: AcquisitionPlanItem['outcome'] | 'existing_offer' | 'idempotent' | 'lookup_failed' | 'persist_failed';
        url: string | null;
        identityKey: string | null;
        candidateKey: string | null;
      }>;
      persistError: string | null;
    }
  | { ok: false; httpStatus: 400 | 403 | 404 | 429 | 500; error: string };

function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return /duplicate key value violates unique constraint/i.test(error.message ?? '');
}

export async function listAcquisitionSources(supabase: SupabaseClient): Promise<AcquisitionSourceRow[]> {
  const { data, error } = await supabase
    .from('acquisition_sources')
    .select('id, source_key, source_type, display_name, description, active')
    .order('source_key', { ascending: true });
  if (error) {
    console.error('[acquisition] sources failed:', error.message);
    return [];
  }
  return (data ?? []) as AcquisitionSourceRow[];
}

export async function registerAcquisitionSource(
  supabase: SupabaseClient,
  input: {
    sourceKey: string;
    sourceType: AcquisitionSourceType;
    displayName: string;
    description?: string | null;
  },
): Promise<{ ok: true; source: AcquisitionSourceRow } | { ok: false; error: string }> {
  const sourceKey = input.sourceKey.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,40}$/.test(sourceKey)) {
    return { ok: false, error: 'source_key inválida.' };
  }
  const displayName = input.displayName.trim().slice(0, 80);
  if (displayName.length < 2) return { ok: false, error: 'Falta el nombre de la fuente.' };
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('acquisition_sources')
    .upsert(
      {
        source_key: sourceKey,
        source_type: input.sourceType,
        display_name: displayName,
        description: input.description?.trim().slice(0, 240) || null,
        active: true,
        updated_at: now,
      },
      { onConflict: 'source_key' },
    )
    .select('id, source_key, source_type, display_name, description, active')
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'No se pudo registrar la fuente.' };
  return { ok: true, source: data as AcquisitionSourceRow };
}

export async function registerAcquisitionScout(
  supabase: SupabaseClient,
  input: { sourceKey: string; displayName: string; createdBy: string },
): Promise<{ ok: true; scout: AcquisitionScoutRow } | { ok: false; httpStatus: 400 | 404; error: string }> {
  const displayName = input.displayName.trim().slice(0, 80);
  if (displayName.length < 2) return { ok: false, httpStatus: 400, error: 'Falta el nombre del scout.' };
  const { data: source, error: sourceError } = await supabase
    .from('acquisition_sources')
    .select('id, source_key, source_type, active')
    .eq('source_key', input.sourceKey)
    .maybeSingle();
  if (sourceError) return { ok: false, httpStatus: 400, error: 'No se pudo leer la fuente.' };
  if (!source) return { ok: false, httpStatus: 404, error: 'La fuente no existe.' };
  if ((source as { source_type: string }).source_type !== 'human') {
    return { ok: false, httpStatus: 400, error: 'Solo una fuente humana tiene scouts.' };
  }
  if ((source as { active: boolean }).active === false) {
    return { ok: false, httpStatus: 400, error: 'La fuente no está activa.' };
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('acquisition_scouts')
    .upsert(
      {
        source_id: (source as { id: string }).id,
        display_name: displayName,
        active: true,
        created_by: input.createdBy,
        updated_at: now,
      },
      { onConflict: 'source_id,display_name' },
    )
    .select('id, source_id, display_name, active, created_by')
    .single();
  if (error || !data) return { ok: false, httpStatus: 400, error: error?.message || 'No se pudo registrar el scout.' };
  return { ok: true, scout: data as AcquisitionScoutRow };
}

async function scoutAcceptedToday(supabase: SupabaseClient, scoutId: string): Promise<number | null> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('hunter_offer_candidates')
    .select('id', { count: 'exact', head: true })
    .eq('decision', 'NEEDS_REVIEW')
    .gte('discovered_at', start.toISOString())
    .filter('evidence->acquisition->>scout_id', 'eq', scoutId);
  if (error) {
    console.error('[acquisition] scout cap failed:', error.message);
    return null;
  }
  return count ?? 0;
}

export async function submitAcquisitionCandidates(input: SubmitAcquisitionInput): Promise<SubmitAcquisitionResult> {
  const metadataError = forbiddenAcquisitionMetadata(input.metadata ?? null);
  if (metadataError) return { ok: false, httpStatus: 400, error: metadataError };
  const planned = planAcquisitionUrls(input.text);
  if ('error' in planned) return { ok: false, httpStatus: 400, error: planned.error };

  const { data: source, error: sourceError } = await input.supabase
    .from('acquisition_sources')
    .select('id, source_key, source_type, display_name, description, active')
    .eq('source_key', input.sourceKey)
    .maybeSingle();
  if (sourceError) return { ok: false, httpStatus: 500, error: 'No se pudo leer la fuente.' };
  if (!source) return { ok: false, httpStatus: 404, error: 'La fuente no existe.' };
  const sourceRow = source as AcquisitionSourceRow;
  if (!sourceRow.active) return { ok: false, httpStatus: 403, error: 'La fuente no está activa.' };

  const scoutId = input.scoutId?.trim() || null;
  if (sourceRow.source_type === 'human' && !scoutId) {
    return { ok: false, httpStatus: 400, error: 'Un envío humano necesita un scout.' };
  }
  if (sourceRow.source_type !== 'human' && scoutId) {
    return { ok: false, httpStatus: 400, error: 'Esta fuente no lleva scout.' };
  }
  let scoutName: string | null = null;
  if (scoutId) {
    const { data: scout, error: scoutError } = await input.supabase
      .from('acquisition_scouts')
      .select('id, source_id, display_name, active')
      .eq('id', scoutId)
      .maybeSingle();
    if (scoutError) return { ok: false, httpStatus: 500, error: 'No se pudo leer el scout.' };
    if (!scout || (scout as { source_id: string }).source_id !== sourceRow.id || (scout as { active: boolean }).active === false) {
      return { ok: false, httpStatus: 400, error: 'El scout no pertenece a esta fuente.' };
    }
    scoutName = String((scout as { display_name?: string }).display_name ?? '').trim() || null;
    const used = await scoutAcceptedToday(input.supabase, scoutId);
    if (used == null) return { ok: false, httpStatus: 500, error: 'No se pudo comprobar el límite del scout.' };
    if (!scoutDailyRoom(used, planned.accepted, ACQUISITION_SCOUT_DAILY_CAP)) {
      return { ok: false, httpStatus: 429, error: 'Este scout ya alcanzó el límite de candidatos de hoy.' };
    }
  }

  const submissionId = acquisitionSubmissionId(sourceRow.source_key, input.externalRunId);
  const discoveredAt = input.discoveredAt && !Number.isNaN(Date.parse(input.discoveredAt))
    ? new Date(input.discoveredAt).toISOString()
    : new Date().toISOString();

  let accepted = 0;
  let duplicates = planned.duplicates;
  let idempotent = 0;
  const items: Array<{
    raw: string;
    outcome: AcquisitionPlanItem['outcome'] | 'existing_offer' | 'idempotent' | 'lookup_failed' | 'persist_failed';
    url: string | null;
    identityKey: string | null;
    candidateKey: string | null;
  }> = [];
  let persistError: string | null = null;

  for (const item of planned.items) {
    if (item.outcome !== 'accepted' || !item.url || !item.candidateKey || !item.identityKey) {
      items.push(item);
      continue;
    }
    let existingOffer = false;
    try {
      const dup = await findDuplicateOfferByUrl(input.supabase, item.url);
      existingOffer = Boolean(dup);
    } catch (error) {
      console.error('[acquisition] duplicate lookup failed:', error instanceof Error ? error.message : error);
      items.push({ ...item, outcome: 'lookup_failed' });
      continue;
    }
    const decision = existingOffer ? 'DUPLICATE' : 'NEEDS_REVIEW';
    const reasonCode = existingOffer ? 'EXISTING_OFFER' : 'ACQUISITION_SUBMITTED';
    const retailer = inferRetailer(item.url, '') ?? 'unknown';
    const evidence = {
      acquisition: {
        source_key: sourceRow.source_key,
        source_type: sourceRow.source_type,
        scout_id: scoutId,
        scout_name: scoutName,
        submission_id: submissionId,
        external_run_id: input.externalRunId?.trim() || null,
        original_url: item.raw,
        normalized_url: item.url,
        discovered_at: discoveredAt,
        actor_user_id: input.actorUserId,
        metadata: input.metadata ?? {},
      },
    };
    const { error } = await input.supabase.from('hunter_offer_candidates').insert({
      run_id: submissionId,
      candidate_key: item.candidateKey,
      source: retailer,
      retailer,
      source_url: item.url,
      canonical_url: item.url,
      original_url: item.raw,
      currency: 'MXN',
      product_fingerprint: strongProductFingerprintForUrl(item.url),
      duplicate_of: existingOffer ? item.identityKey : null,
      decision,
      reason_code: reasonCode,
      reason_detail: null,
      rejection_stage: existingOffer ? 'dedup' : 'discovery',
      evidence,
      raw_metadata: input.metadata ?? {},
      inserted_offer_id: null,
      discovered_at: discoveredAt,
      last_seen_at: discoveredAt,
      hunter_version: HUNTER_VERSION,
      normalization_version: NORMALIZATION_VERSION,
      scoring_version: SCORING_VERSION,
      decision_policy_version: DECISION_POLICY_VERSION,
    });
    if (error && isUniqueViolation(error)) {
      idempotent += 1;
      items.push({ ...item, outcome: 'idempotent' });
      continue;
    }
    if (error) {
      console.error('[acquisition] insert candidate failed:', error.message);
      persistError = 'No se pudieron guardar todos los candidatos.';
      const rest = planned.items.slice(planned.items.indexOf(item));
      for (const pending of rest) {
        items.push(pending.outcome === 'accepted' ? { ...pending, outcome: 'persist_failed' } : pending);
      }
      break;
    }
    if (existingOffer) {
      duplicates += 1;
      items.push({ ...item, outcome: 'existing_offer' });
      continue;
    }
    accepted += 1;
    items.push(item);
  }

  if (persistError && accepted === 0 && idempotent === 0) {
    return { ok: false, httpStatus: 500, error: persistError };
  }

  return {
    ok: true,
    submissionId,
    sourceKey: sourceRow.source_key,
    scoutId,
    received: planned.received,
    accepted,
    duplicates,
    invalid: planned.invalid,
    overCap: planned.overCap,
    idempotent,
    persistError,
    items,
  };
}
