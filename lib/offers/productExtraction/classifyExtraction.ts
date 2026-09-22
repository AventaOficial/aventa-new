/**
 * Estados de extracción del parser "Subir oferta".
 * success = producto usable con metadata suficiente
 * partial = producto identificado pero faltan piezas clave (p. ej. imágenes)
 * failed = no se pudo identificar el producto
 */
export type OfferExtractionStatus = 'success' | 'partial' | 'failed';

export type OfferExtractionErrorCode =
  | 'URL_RESOLUTION_FAILED'
  | 'RETAILER_NOT_SUPPORTED'
  | 'REDIRECT_NOT_ALLOWED'
  | 'PRODUCT_ID_NOT_FOUND'
  | 'PRODUCT_EXTRACTION_FAILED'
  | 'IMAGE_EXTRACTION_FAILED'
  | 'PARTIAL_EXTRACTION'
  | 'INVALID_URL';

export type ClassifyOfferExtractionInput = {
  title: string | null;
  imageCount: number;
  hasPrice: boolean;
  hasCategory: boolean;
  productIdentity: boolean;
  reasonInvalid?: boolean;
};

/**
 * Clasifica el resultado del parse para UX (no inventa éxito).
 * Compatible con la semántica previa: imágenes o precio solos ya cuentan como señal útil.
 */
export function classifyOfferExtraction(input: ClassifyOfferExtractionInput): {
  status: OfferExtractionStatus;
  errorCode: OfferExtractionErrorCode | null;
  missing: string[];
} {
  if (input.reasonInvalid) {
    return { status: 'failed', errorCode: 'INVALID_URL', missing: ['url'] };
  }

  const missing: string[] = [];
  if (!input.title) missing.push('título');
  if (input.imageCount === 0) missing.push('imágenes');
  if (!input.hasPrice) missing.push('precio');

  const hasAnySignal =
    Boolean(input.title) ||
    input.imageCount > 0 ||
    input.hasPrice ||
    input.productIdentity;

  if (!hasAnySignal) {
    return { status: 'failed', errorCode: 'PRODUCT_EXTRACTION_FAILED', missing };
  }

  // Success: título + imágenes (precio/categoría opcionales).
  if (input.title && input.imageCount > 0) {
    return {
      status: 'success',
      errorCode: null,
      missing: missing.filter((m) => m !== 'título' && m !== 'imágenes'),
    };
  }

  // Partial: hay señal útil pero faltan piezas clave (típico: título+precio sin fotos).
  return { status: 'partial', errorCode: 'PARTIAL_EXTRACTION', missing };
}

function hostHint(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function tipForHost(host: string | null): string {
  if (!host) {
    return 'Pega el enlace completo del producto (https://…) desde Amazon, Mercado Libre u otra tienda soportada.';
  }
  if (host === 'link.amazon' || host.endsWith('.link.amazon')) {
    return 'Abre el producto en Amazon, copia la URL larga (amazon.com.mx/…/dp/…) y pégala aquí.';
  }
  if (host === 'a.co' || host.endsWith('.a.co') || host === 'amzn.to' || host.endsWith('.amzn.to')) {
    return 'Si falla el acortador, abre el link, copia la URL completa con /dp/ y pégala de nuevo.';
  }
  if (host === 'meli.la' || host.endsWith('.meli.la')) {
    return 'Si el corto no carga, abre el producto en Mercado Libre y pega la URL completa (mercadolibre.com.mx/…).';
  }
  if (host.includes('amazon.')) {
    return 'Usa la ficha del producto (…/dp/ASIN), no resultados de búsqueda ni listas.';
  }
  if (host === 'walmart.page.link' || host.endsWith('.walmart.page.link')) {
    return 'Abre el producto en Walmart y pega la URL completa (walmart.com.mx/ip/…).';
  }
  if (host.includes('walmart.')) {
    return 'Usa la ficha del producto (…/ip/…/número), no resultados de búsqueda.';
  }
  if (host === 'liverpool.app.link' || host.endsWith('.liverpool.app.link')) {
    return 'Abre el producto en Liverpool y pega la URL completa (liverpool.com.mx/tienda/pdp/…).';
  }
  if (host.includes('liverpool.')) {
    return 'Usa la ficha del producto en liverpool.com.mx (página PDP), no búsquedas ni categorías.';
  }
  if (host === 'coppel.app.link' || host.endsWith('.coppel.app.link')) {
    return 'Abre el producto en Coppel y pega la URL completa (coppel.com/…).';
  }
  if (host.includes('coppel.')) {
    return 'Usa la ficha del producto en coppel.com (con el número/SKU al final), no búsquedas ni categorías.';
  }
  if (host.includes('elektra.')) {
    return 'Usa la ficha del producto en elektra.mx (con el número/SKU), no búsquedas ni categorías.';
  }
  if (host.includes('mercadolibre') || host.includes('mercadolivre')) {
    return 'Usa el enlace del artículo o de la publicación, no la página de búsqueda.';
  }
  return 'Usa el enlace directo del producto en la tienda (no búsquedas, categorías ni blogs).';
}

function formatMissing(missing: string[]): string {
  if (missing.length === 0) return 'algunos datos';
  if (missing.length === 1) return missing[0];
  if (missing.length === 2) return `${missing[0]} y ${missing[1]}`;
  return `${missing.slice(0, -1).join(', ')} y ${missing[missing.length - 1]}`;
}

function howToCompleteMissing(missing: string[]): string {
  const parts: string[] = [];
  if (missing.includes('imágenes')) {
    parts.push('sube las fotos o pega la URL completa del producto');
  }
  if (missing.includes('precio')) {
    parts.push('escribe el precio actual (y el anterior si aplica)');
  }
  if (missing.includes('título')) {
    parts.push('completa el título');
  }
  if (parts.length === 0) {
    return 'Revisa y completa lo que falte en el formulario.';
  }
  if (parts.length === 1) return `Para mejorar: ${parts[0]}.`;
  return `Para mejorar: ${parts.slice(0, -1).join('; ')}; y ${parts[parts.length - 1]}.`;
}

export type OfferExtractionUserMessageInput = {
  status: OfferExtractionStatus;
  missing?: string[];
  bits?: string[];
  /** Mensaje del servidor (meli.la, allowlist, etc.) — se enriquece con tip si hace falta. */
  serverError?: string | null;
  reason?: 'invalid_url' | 'extract_failed' | null;
  url?: string | null;
  errorCode?: OfferExtractionErrorCode | string | null;
};

/**
 * Mensaje UX en el mismo bloque del modal: qué pasó, por qué, y cómo mejorarlo.
 * Sin códigos internos ni detalles de infraestructura.
 */
export function offerExtractionUserMessage(params: OfferExtractionUserMessageInput): string {
  const missing = params.missing ?? [];
  const bits = params.bits ?? [];
  const host = hostHint(params.url);
  const tip = tipForHost(host);
  const server = typeof params.serverError === 'string' ? params.serverError.trim() : '';

  if (params.reason === 'invalid_url' || params.errorCode === 'INVALID_URL' || params.errorCode === 'RETAILER_NOT_SUPPORTED') {
    return (
      `No podemos usar este enlace (tienda no reconocida o URL inválida). ` +
      `Por qué: solo leemos tiendas soportadas por seguridad. ` +
      `Cómo mejorarlo: ${tip}`
    );
  }

  if (params.status === 'failed') {
    if (server) {
      // El server ya explica el caso (p.ej. meli.la); añade tip concreto si no viene en el texto.
      if (/completa|pega|abre/i.test(server)) return server;
      return `${server} Cómo mejorarlo: ${tip}`;
    }
    return (
      `No pudimos leer el producto automáticamente. ` +
      `Por qué: el enlace no apunta a una ficha clara o la tienda bloqueó la lectura. ` +
      `Cómo mejorarlo: ${tip} Mientras tanto puedes completar título, precio y fotos a mano.`
    );
  }

  if (params.status === 'partial') {
    const got = bits.length > 0 ? `Obtuvimos ${bits.join(', ')}. ` : '';
    const miss = formatMissing(missing);
    const why =
      missing.includes('imágenes') && !missing.includes('título')
        ? 'Por qué: la tienda no expuso la galería en este enlace (a veces pasa con links cortos o de compartir). '
        : missing.includes('título')
          ? 'Por qué: faltó identificar bien el producto con este enlace. '
          : 'Por qué: la página no trajo todos los datos. ';
    return `${got}Falta: ${miss}. ${why}${howToCompleteMissing(missing)}`;
  }

  // success
  const ready = bits.length > 0 ? bits.join(', ') : 'datos del producto';
  if (missing.length > 0) {
    return `Listo: ${ready}. Opcional: completa ${formatMissing(missing)} si lo tienes.`;
  }
  return `Listo: ${ready}. Revisa que todo coincida con la oferta y publica.`;
}
