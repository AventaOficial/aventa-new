import { mercadoLibreImageResourceId } from '@/lib/offers/selectOfferImages';
import { isHighConfidenceJunkImage } from '@/lib/offers/selectOfferImages';

export type MlImageProvenanceSource =
  | 'ml_api'
  | 'ml_api_variation'
  | 'product_jsonld'
  | 'og'
  | 'twitter'
  | 'same_resource';

export type MlImageCandidate = {
  url: string;
  source: MlImageProvenanceSource;
  sourceItemId: string | null;
  pictureId: string | null;
  isPrimary: boolean;
};

function isHttpUrl(u: string): boolean {
  return /^https?:\/\//i.test(u);
}

function normalizeUrl(raw: string): string {
  return raw.trim().replace(/^http:\/\//i, 'https://');
}

/** Rechaza banners, logos, recomendaciones y thumbnails diminutos de ML. */
export function isRejectedMercadoLibreImage(url: string, sourceItemId: string | null): boolean {
  if (!isHttpUrl(url)) return true;
  if (isHighConfidenceJunkImage(url)) return true;

  const lower = url.toLowerCase();
  const path = lower.split('?')[0] ?? lower;

  if (/recommend|similar|related|carousel|banner|promo|sponsor|adsystem|tracking/i.test(lower)) {
    return true;
  }
  if (/\/logo\.(?:png|webp|jpg|jpeg|svg)(?:$|[?#])/i.test(path)) return true;
  if (/D_Q_NP_|-I\.(?:jpg|webp|jpeg|png)/i.test(path) && !/-O\.|-F\.|-G\./i.test(path)) {
    // Thumbnail pequeño; permitir si es la única foto API del item.
  }

  if (sourceItemId && /mlstatic\.com/i.test(url)) {
    // Las fotos oficiales suelen incluir el picture id, no el item id en la URL.
    // La pertenencia se valida por sourceItemId en metadata, no por CDN path.
  }

  return false;
}

export function picturesFromMlApiBody(
  body: { pictures?: Array<{ id?: string; secure_url?: string; url?: string }> } | null | undefined,
  itemId: string,
): MlImageCandidate[] {
  if (!body?.pictures?.length) return [];
  const out: MlImageCandidate[] = [];
  for (let i = 0; i < body.pictures.length; i++) {
    const p = body.pictures[i];
    const direct = normalizeUrl(p.secure_url || p.url || '');
    let url = direct;
    if (direct) {
      url = direct
        .replace(/-I\.(jpg|webp|jpeg|png)/i, '-O.$1')
        .replace(/D_Q_NP_/i, 'D_NQ_NP_2X_');
    } else if (p.id) {
      url = `https://http2.mlstatic.com/D_NQ_NP_2X_${p.id}-F.webp`;
    }
    if (!isHttpUrl(url)) continue;
    if (isRejectedMercadoLibreImage(url, itemId)) continue;
    out.push({
      url,
      source: 'ml_api',
      sourceItemId: itemId,
      pictureId: p.id ?? null,
      isPrimary: i === 0,
    });
    if (out.length >= 24) break;
  }
  return out;
}

/** Variaciones del mismo item: solo picture_ids del listing consultado. */
export function picturesFromMlVariations(
  body:
    | {
        variations?: Array<{ picture_ids?: string[] }>;
      }
    | null
    | undefined,
  itemId: string,
): MlImageCandidate[] {
  const variations = body?.variations;
  if (!variations?.length) return [];
  const out: MlImageCandidate[] = [];
  const seen = new Set<string>();
  for (const variation of variations) {
    for (const pictureId of variation.picture_ids ?? []) {
      const id = typeof pictureId === 'string' ? pictureId.trim() : '';
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const url = `https://http2.mlstatic.com/D_NQ_NP_2X_${id}-F.webp`;
      if (isRejectedMercadoLibreImage(url, itemId)) continue;
      out.push({
        url,
        source: 'ml_api_variation',
        sourceItemId: itemId,
        pictureId: id,
        isPrimary: false,
      });
      if (out.length >= 24) break;
    }
    if (out.length >= 24) break;
  }
  return out;
}

export function mergeMlImageCandidates(
  lists: MlImageCandidate[][],
  opts?: { minApiToSkipFallback?: number; sourceItemId?: string | null },
): MlImageCandidate[] {
  const minApi = opts?.minApiToSkipFallback ?? 2;
  const flat = lists.flat().filter((c): c is MlImageCandidate => Boolean(c?.url && c?.source));
  const api = flat.filter((c) => c.source === 'ml_api' || c.source === 'ml_api_variation');
  const trusted = flat.filter(
    (c) => c.source === 'og' || c.source === 'twitter' || c.source === 'product_jsonld',
  );

  const wantedItemId = opts?.sourceItemId ?? null;
  const belongsToItem = (c: MlImageCandidate) =>
    !wantedItemId || !c.sourceItemId || c.sourceItemId === wantedItemId;

  // Fotos de otro item_id (buy-box winner, similares) no entran si ya hay del item pedido.
  const apiForItem = api.filter(belongsToItem);
  const apiPool = apiForItem.length > 0 ? apiForItem : [];

  let pool: MlImageCandidate[];
  if (apiPool.length >= minApi) {
    pool = apiPool;
  } else if (apiPool.length === 1) {
    const cover = apiPool[0];
    const sameResource = flat.filter(
      (c) =>
        belongsToItem(c) &&
        (c.source === 'same_resource' ||
          (c.url !== cover.url &&
            mercadoLibreImageResourceId(c.url) != null &&
            mercadoLibreImageResourceId(c.url) === mercadoLibreImageResourceId(cover.url))),
    );
    pool = [cover, ...sameResource];
  } else if (trusted.length > 0) {
    pool = trusted.filter(belongsToItem);
  } else {
    // Sin fotos del item pedido: no rellenar con otro listing.
    pool = [];
  }

  const seen = new Set<string>();
  const out: MlImageCandidate[] = [];
  for (const c of pool) {
    const key = mercadoLibreImageResourceId(c.url) ?? c.url.split('?')[0] ?? c.url;
    if (seen.has(key)) continue;
    if (isRejectedMercadoLibreImage(c.url, c.sourceItemId ?? wantedItemId)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= 24) break;
  }

  const primaryIdx = out.findIndex((c) => c.isPrimary);
  if (primaryIdx > 0) {
    const [cover] = out.splice(primaryIdx, 1);
    out.unshift(cover);
  }

  return out;
}

export function mlImageCandidatesToUrls(candidates: MlImageCandidate[]): string[] {
  return candidates.map((c) => c.url);
}
