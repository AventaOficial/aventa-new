import { normalizeInterestText } from '@/lib/interests/normalize';
import {
  activeDespensaNeeds,
  DESPENSA_CATALOG_VERSION,
  type DespensaFamilyId,
  type DespensaNeed,
} from '@/lib/despensa/catalog';

export type DespensaClassification = {
  needId: string;
  family: DespensaFamilyId;
  matchedSynonym: string;
  catalogVersion: string;
};

function phraseIndex(hay: string, phrase: string): number {
  const idx = ` ${hay} `.indexOf(` ${phrase} `);
  return idx;
}

/**
 * Asigna como máximo una necesidad del catálogo a un texto (título de oferta o interés).
 * Gana el sinónimo que aparece antes en el texto; a igual posición, el más largo.
 * Así «Jabón para trastes» es lavatrastes y no jabón de tocador.
 * Devuelve null si no hay coincidencia o si una exclusión de la necesidad aparece en el texto.
 */
export function classifyDespensaText(text: string | null | undefined): DespensaClassification | null {
  const normalized = normalizeInterestText(text ?? '');
  if (!normalized) return null;
  let best: { need: DespensaNeed; synonym: string; at: number } | null = null;
  for (const need of activeDespensaNeeds()) {
    if (need.excludes?.some((ex) => phraseIndex(normalized, ex) >= 0)) continue;
    for (const synonym of need.synonyms) {
      const at = phraseIndex(normalized, synonym);
      if (at < 0) continue;
      if (
        !best ||
        at < best.at ||
        (at === best.at && synonym.length > best.synonym.length)
      ) {
        best = { need, synonym, at };
      }
    }
  }
  if (!best) return null;
  return {
    needId: best.need.id,
    family: best.need.family,
    matchedSynonym: best.synonym,
    catalogVersion: DESPENSA_CATALOG_VERSION,
  };
}

/**
 * Necesidades declaradas por el usuario en `/me/intereses`.
 * No crea otra fuente de preferencias: lee los intereses existentes (nombre y alias).
 */
export function despensaNeedIdsFromInterests(
  interests: ReadonlyArray<{ label: string; aliases?: readonly string[] | null }>,
): Set<string> {
  const out = new Set<string>();
  for (const interest of interests) {
    for (const text of [interest.label, ...(interest.aliases ?? [])]) {
      const hit = classifyDespensaText(text);
      if (hit) out.add(hit.needId);
    }
  }
  return out;
}
