import { activeDespensaNeeds, DESPENSA_CATALOG_VERSION, type DespensaFamilyId } from '@/lib/despensa/catalog';
import { DESPENSA_SOURCES, despensaSourceForUrl } from '@/lib/despensa/sources';

/**
 * Contrato de misiones de búsqueda de Despensa para agentes externos (Grok vía MCP).
 *
 * Solo contrato: nada aquí se ejecuta ni está conectado a `/api/mcp`.
 * Una misión produce candidatos; publicar sigue requiriendo el pipeline normal
 * (`ingestOfferObservation` → `pending` → moderación humana).
 */
export const DESPENSA_MISSIONS_ENABLED = false as const;
export const DESPENSA_MISSION_CONTRACT_VERSION = 'despensa-missions-v1';

export type DespensaMission = {
  id: string;
  contractVersion: string;
  catalogVersion: string;
  needId: string;
  family: DespensaFamilyId;
  searchTerms: readonly string[];
  /** Fuentes con código de descubrimiento existente. No implica que estén encendidas. */
  allowedSourceIds: readonly string[];
  writeMode: 'candidates_only';
  requiresHumanModeration: true;
};

export function buildDespensaMissions(): DespensaMission[] {
  const allowedSourceIds = DESPENSA_SOURCES.filter((s) => s.implemented.discovery).map((s) => s.id);
  return activeDespensaNeeds().map((need) => ({
    id: `despensa:${need.id}`,
    contractVersion: DESPENSA_MISSION_CONTRACT_VERSION,
    catalogVersion: DESPENSA_CATALOG_VERSION,
    needId: need.id,
    family: need.family,
    searchTerms: need.synonyms.slice(0, 3),
    allowedSourceIds: DESPENSA_SOURCES.filter(
      (s) => allowedSourceIds.includes(s.id) && s.declared.families.includes(need.family),
    ).map((s) => s.id),
    writeMode: 'candidates_only',
    requiresHumanModeration: true,
  }));
}

export type DespensaMissionCandidate = {
  missionId: string;
  needId: string;
  url: string;
  title: string;
  price: number;
  observedAt: string;
};

export type CandidateCheck =
  | { ok: true; sourceId: string }
  | { ok: false; reason: 'unknown_mission' | 'need_mismatch' | 'missing_field' | 'invalid_price' | 'source_not_allowed' | 'publish_not_allowed' };

/**
 * Valida un candidato devuelto por un agente. Rechaza cualquier intento de publicar:
 * un candidato con `status`, `publish` o `approved` no es un candidato.
 */
export function checkMissionCandidate(
  candidate: DespensaMissionCandidate & Record<string, unknown>,
  missions: readonly DespensaMission[],
): CandidateCheck {
  if ('publish' in candidate || 'status' in candidate || 'approved' in candidate) {
    return { ok: false, reason: 'publish_not_allowed' };
  }
  const mission = missions.find((m) => m.id === candidate.missionId);
  if (!mission) return { ok: false, reason: 'unknown_mission' };
  if (mission.needId !== candidate.needId) return { ok: false, reason: 'need_mismatch' };
  if (!candidate.url?.trim() || !candidate.title?.trim() || !candidate.observedAt?.trim()) {
    return { ok: false, reason: 'missing_field' };
  }
  if (!(typeof candidate.price === 'number' && candidate.price > 0)) return { ok: false, reason: 'invalid_price' };
  const source = despensaSourceForUrl(candidate.url);
  if (!source || !mission.allowedSourceIds.includes(source.id)) return { ok: false, reason: 'source_not_allowed' };
  return { ok: true, sourceId: source.id };
}
