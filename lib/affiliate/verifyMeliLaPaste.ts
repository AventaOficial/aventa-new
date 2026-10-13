import {
  extractMercadoLibreUserProductId,
  isMercadoLibreHost,
  resolveMercadoLibreItem,
} from '@/lib/offers/resolveMercadoLibreItem';
import { fetchFollowingRedirectsSafely, type SafeFetchResult } from '@/lib/server/fetchUrlSafety';
import { AVENTA_MERCADOLIBRE_AFFILIATE_TOOL } from './mercadoLibreAffiliateAccount';

export { AVENTA_MERCADOLIBRE_AFFILIATE_TOOL };

/**
 * Verificación en servidor del meli.la que pega el moderador.
 *
 * meli.la responde 301 a `/social/{cuenta}?matt_word=…&matt_tool=…&ref=…`.
 * La cuenta afiliada sale de la redirección; el producto va cifrado en `ref`,
 * así que se lee del HTML: la primera tarjeta de `card-featured` es el producto compartido.
 * El resto de la página son recomendaciones y nunca cuentan como coincidencia.
 *
 * El original puede ser un enlace largo (ids en la URL) o el meli.la que subió el usuario
 * (se lee su página igual que la del moderador).
 *
 * - verified: cuenta de Aventa y producto destacado coinciden.
 * - needs_manual_review: no se pudo comprobar cuenta o producto (red, bloqueo, página sin tarjeta).
 *   Solo se acepta con confirmación explícita del moderador.
 * - rejected: no es afiliado, es otra cuenta o muestra otro producto.
 */
export type MeliLaVerificationStatus = 'verified' | 'needs_manual_review' | 'rejected';

export type MeliLaPasteVerification = {
  status: MeliLaVerificationStatus;
  reason: string | null;
  accountVerified: boolean;
  productVerified: boolean;
  affiliateWord: string | null;
  affiliateTool: string | null;
  destinationUrl: string | null;
};

const VERIFY_TIMEOUT_MS = 10_000;
const MAX_HTML_CHARS = 3_000_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

type FetchPage = (url: string) => Promise<SafeFetchResult>;

const defaultFetchPage: FetchPage = (url) =>
  fetchFollowingRedirectsSafely(url, {
    timeoutMs: VERIFY_TIMEOUT_MS,
    method: 'GET',
    requireHttps: true,
    requireAllowlist: true,
    signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

const FEATURED_MARKER = '"card-featured"';
const FEATURED_WINDOW_CHARS = 6_000;

/**
 * Ids del producto compartido en una página `/social`: la primera tarjeta de `card-featured`.
 * El resto de la página son recomendaciones. null si la página no trae esa sección.
 */
export function featuredMercadoLibreIdsFromSocialHtml(html: string): string[] | null {
  const marker = html.indexOf(FEATURED_MARKER);
  if (marker < 0) return null;
  const window = html.slice(marker, marker + FEATURED_WINDOW_CHARS);
  const metadataAt = window.indexOf('"metadata":{');
  if (metadataAt < 0) return null;
  const metadata = window.slice(metadataAt, metadataAt + 400);
  const ids = new Set<string>();
  const item = metadata.match(/"id":"(ML[A-Z]U?\d+)"/);
  if (item?.[1]) ids.add(item[1].toUpperCase());
  const product = metadata.match(/"product_id":"(ML[A-Z]U?\d+)"/);
  if (product?.[1]) ids.add(product[1].toUpperCase());
  return ids.size > 0 ? [...ids] : null;
}

/** Ids de producto del enlace original: item, catálogo (/p/) y user-product (/up/). */
export function originalMercadoLibreProductIds(originalUrl: string): string[] {
  const ids = new Set<string>();
  const resolved = resolveMercadoLibreItem(originalUrl);
  if (resolved?.itemId) ids.add(resolved.itemId.replace('-', '').toUpperCase());
  if (resolved?.catalogProductId) ids.add(resolved.catalogProductId.replace('-', '').toUpperCase());
  const up = extractMercadoLibreUserProductId(originalUrl);
  if (up) ids.add(up.replace('-', '').toUpperCase());
  return [...ids];
}

function isMeliLaUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'meli.la' || h.endsWith('.meli.la');
  } catch {
    return false;
  }
}

type MeliLaPage =
  | { kind: 'unreachable'; reason: string }
  | { kind: 'not_mercadolibre'; finalUrl: string }
  | {
      kind: 'read';
      finalUrl: URL;
      /** Producto compartido: ids en la URL de destino o la tarjeta `card-featured`. */
      featuredIds: string[] | null;
      unreadableReason: string;
    };

async function readMeliLaPage(url: string, fetchPage: FetchPage): Promise<MeliLaPage> {
  let result: SafeFetchResult;
  try {
    result = await fetchPage(url);
  } catch {
    return { kind: 'unreachable', reason: 'No se pudo abrir el enlace' };
  }
  if (!result.ok) return { kind: 'unreachable', reason: 'No se pudo abrir el enlace' };

  let finalUrl: URL;
  try {
    finalUrl = new URL(result.finalUrl);
  } catch {
    return { kind: 'unreachable', reason: 'No se pudo abrir el enlace' };
  }
  if (isMeliLaUrl(finalUrl.toString())) {
    return { kind: 'unreachable', reason: 'Mercado Libre no redirigió el enlace' };
  }
  if (!isMercadoLibreHost(finalUrl.hostname)) {
    return { kind: 'not_mercadolibre', finalUrl: finalUrl.toString() };
  }

  const directIds = originalMercadoLibreProductIds(finalUrl.toString());
  if (directIds.length > 0) {
    return { kind: 'read', finalUrl, featuredIds: directIds, unreadableReason: '' };
  }

  const blocked = 'Mercado Libre no dejó leer la página';
  if (!result.response.ok) {
    return { kind: 'read', finalUrl, featuredIds: null, unreadableReason: blocked };
  }

  let html: string;
  try {
    html = (await result.response.text()).slice(0, MAX_HTML_CHARS);
  } catch {
    return { kind: 'read', finalUrl, featuredIds: null, unreadableReason: blocked };
  }

  return {
    kind: 'read',
    finalUrl,
    featuredIds: featuredMercadoLibreIdsFromSocialHtml(html),
    unreadableReason: 'La página de Mercado Libre no mostró el producto compartido',
  };
}

async function expectedProductIds(originalUrl: string, fetchPage: FetchPage): Promise<string[]> {
  const fromUrl = originalMercadoLibreProductIds(originalUrl);
  if (fromUrl.length > 0 || !isMeliLaUrl(originalUrl)) return fromUrl;
  const page = await readMeliLaPage(originalUrl, fetchPage);
  return page.kind === 'read' ? (page.featuredIds ?? []) : [];
}

export async function verifyMeliLaPaste(
  originalUrl: string,
  meliLaUrl: string,
  deps: { fetchPage?: FetchPage; expectedAffiliateTool?: string } = {}
): Promise<MeliLaPasteVerification> {
  const fetchPage = deps.fetchPage ?? defaultFetchPage;
  const expectedTool = deps.expectedAffiliateTool ?? AVENTA_MERCADOLIBRE_AFFILIATE_TOOL;

  const pasted = await readMeliLaPage(meliLaUrl, fetchPage);
  if (pasted.kind === 'unreachable') {
    return {
      status: 'needs_manual_review',
      reason: pasted.reason,
      accountVerified: false,
      productVerified: false,
      affiliateWord: null,
      affiliateTool: null,
      destinationUrl: null,
    };
  }
  if (pasted.kind === 'not_mercadolibre') {
    return {
      status: 'rejected',
      reason: 'El enlace no lleva a Mercado Libre',
      accountVerified: false,
      productVerified: false,
      affiliateWord: null,
      affiliateTool: null,
      destinationUrl: pasted.finalUrl,
    };
  }

  const destinationUrl = pasted.finalUrl.toString();
  const affiliateTool = pasted.finalUrl.searchParams.get('matt_tool')?.trim() || null;
  const affiliateWord = pasted.finalUrl.searchParams.get('matt_word')?.trim() || null;
  const base = { affiliateWord, affiliateTool, destinationUrl };

  if (!affiliateTool) {
    return {
      ...base,
      status: 'rejected',
      reason: 'Este meli.la no es un enlace de afiliado',
      accountVerified: false,
      productVerified: false,
    };
  }
  if (affiliateTool !== expectedTool) {
    return {
      ...base,
      status: 'rejected',
      reason: `Este meli.la es de otra cuenta de afiliado (${affiliateWord ?? affiliateTool})`,
      accountVerified: false,
      productVerified: false,
    };
  }

  const expectedIds = await expectedProductIds(originalUrl, fetchPage);
  if (expectedIds.length === 0) {
    return {
      ...base,
      status: 'needs_manual_review',
      reason: 'No se pudo identificar el producto original',
      accountVerified: true,
      productVerified: false,
    };
  }

  if (!pasted.featuredIds) {
    return {
      ...base,
      status: 'needs_manual_review',
      reason: pasted.unreadableReason,
      accountVerified: true,
      productVerified: false,
    };
  }

  return pasted.featuredIds.some((id) => expectedIds.includes(id))
    ? { ...base, status: 'verified', reason: null, accountVerified: true, productVerified: true }
    : {
        ...base,
        status: 'rejected',
        reason: 'El meli.la muestra otro producto',
        accountVerified: true,
        productVerified: false,
      };
}
