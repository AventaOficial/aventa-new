import {
  activeDespensaNeeds,
  DESPENSA_CATALOG_VERSION,
  type DespensaFamilyId,
  type DespensaReferenceBasis,
} from '@/lib/despensa/catalog';
import { DESPENSA_SOURCES, despensaSourceForUrl } from '@/lib/despensa/sources';

/**
 * Contrato de misiones de búsqueda de Despensa para agentes externos (Grok vía MCP).
 *
 * Aventa no ejecuta misiones (`DESPENSA_MISSIONS_ENABLED`). El resumen se publica en solo
 * lectura dentro de `get_submission_rules`; el agente envía con `submit_deal_candidates`,
 * que deja todo `pending` para moderación humana. No hay herramienta ni escritura nuevas.
 */
export const DESPENSA_MISSIONS_ENABLED = false as const;
export const DESPENSA_MISSION_CONTRACT_VERSION = 'despensa-missions-v2';

export type DespensaMission = {
  id: string;
  contractVersion: string;
  catalogVersion: string;
  needId: string;
  label: string;
  family: DespensaFamilyId;
  /** `official_list` primero: productos de la canasta publicada por Profeco. */
  priority: DespensaReferenceBasis;
  searchTerms: readonly string[];
  /** Variantes que deben nombrarse en el título; no son intercambiables. */
  variants: readonly string[];
  /** Fuentes con código de descubrimiento existente. No implica que estén encendidas. */
  allowedSourceIds: readonly string[];
  writeMode: 'candidates_only';
  requiresHumanModeration: true;
};

export function buildDespensaMissions(): DespensaMission[] {
  const allowedSourceIds = DESPENSA_SOURCES.filter((s) => s.implemented.discovery).map((s) => s.id);
  const missions = activeDespensaNeeds().map((need) => ({
    id: `despensa:${need.id}`,
    contractVersion: DESPENSA_MISSION_CONTRACT_VERSION,
    catalogVersion: DESPENSA_CATALOG_VERSION,
    needId: need.id,
    label: need.label,
    family: need.family,
    priority: need.basis,
    searchTerms: need.synonyms.slice(0, 3),
    variants: (need.variants ?? []).map((v) => v.label),
    allowedSourceIds: DESPENSA_SOURCES.filter(
      (s) => allowedSourceIds.includes(s.id) && s.declared.families.includes(need.family),
    ).map((s) => s.id),
    writeMode: 'candidates_only' as const,
    requiresHumanModeration: true as const,
  }));
  const rank = (m: DespensaMission) => (m.priority === 'official_list' ? 0 : 1);
  return missions.sort((a, b) => rank(a) - rank(b));
}

/** Reglas de evidencia que el agente debe cumplir antes de enviar. */
export const DESPENSA_MISSION_EVIDENCE_RULES = [
  'Envía solo productos que viste en la página de la tienda, con su precio y la hora de observación.',
  'El título debe nombrar marca, variante y contenido neto (g, kg, ml, L o piezas) tal como aparecen en la página.',
  'Usa la URL canónica del producto, sin query (?) ni fragmento (#).',
  'originalPrice solo si la tienda muestra un precio de lista en esa misma página y momento; nunca lo calcules.',
  'En note indica región o sucursal observada y disponibilidad. Si solo viste una sucursal, no digas que aplica a todo México.',
  'No repitas el mismo precio como si fueran observaciones distintas; no inventes precios, marcas, fechas ni disponibilidad.',
  'Antes de enviar usa check_offer_exists; después consulta get_submission_status. Nada se publica sin revisión humana.',
  'No evadas bloqueos, límites, CAPTCHA ni controles de acceso. Si una fuente no es accesible, repórtalo y sigue.',
] as const;

/** Resumen público y de solo lectura para `get_submission_rules`. */
export function buildDespensaMissionBrief() {
  return {
    contractVersion: DESPENSA_MISSION_CONTRACT_VERSION,
    catalogVersion: DESPENSA_CATALOG_VERSION,
    writeMode: 'candidates_only' as const,
    evidenceRules: DESPENSA_MISSION_EVIDENCE_RULES,
    missions: buildDespensaMissions().map((m) => ({
      needId: m.needId,
      label: m.label,
      priority: m.priority,
      searchTerms: m.searchTerms,
      variants: m.variants,
    })),
  };
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
