/**
 * Aplica parámetros de afiliado de AVENTA por dominio (env).
 * Sin credenciales configuradas, la URL no cambia.
 * (Lógica ML duplicada aquí a propósito para evitar import circular con offerUrl.)
 */
function isMeliLaShortUrl(url: string): boolean {
  try {
    const h = new URL(url.trim()).hostname.toLowerCase();
    return h === 'meli.la' || h.endsWith('.meli.la');
  } catch {
    return false;
  }
}

function isMercadoLibreOfferUrlLocal(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes('mercadolibre.')) return true;
  return isMeliLaShortUrl(url);
}

function getPlatformMercadoLibreAffiliateTagLocal(): string | null {
  const t =
    process.env.ML_AFFILIATE_TAG?.trim() ||
    process.env.NEXT_PUBLIC_ML_AFFILIATE_TAG?.trim();
  return t || null;
}

function applyMercadoLibreAffiliateTagLocal(url: string, tag: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('tag', tag);
    return parsed.toString();
  } catch {
    return url;
  }
}

function getEnv(...keys: string[]): string | null {
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return null;
}

function applyAmazonAssociate(url: string, tag: string): string {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (!h.includes('amazon.')) return url;
    u.searchParams.set('tag', tag);
    return u.toString();
  } catch {
    return url;
  }
}

function applyAliExpress(url: string, affFcid: string): string {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (!h.includes('aliexpress.')) return url;
    u.searchParams.set('aff_fcid', affFcid);
    if (!u.searchParams.has('aff_platform')) u.searchParams.set('aff_platform', 'portals-tool');
    return u.toString();
  } catch {
    return url;
  }
}

/** Pares clave=valor desde env tipo "wmlspartner=xx&sourceid=yy" */
function applyQueryParamsFromEnv(url: string, hostSubstring: string, envValue: string): string {
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().includes(hostSubstring)) return url;
    const params = new URLSearchParams(envValue);
    params.forEach((val, key) => {
      if (key) u.searchParams.set(key, val);
    });
    return u.toString();
  } catch {
    return url;
  }
}

function applyShein(url: string, affId: string): string {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (!h.includes('shein.')) return url;
    u.searchParams.set('aff_id', affId);
    return u.toString();
  } catch {
    return url;
  }
}

function applyTemu(url: string, pid: string): string {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (!h.includes('temu.')) return url;
    u.searchParams.set('rp_pid', pid);
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Orden: ML → Amazon → AliExpress → Walmart → Shein → Temu.
 * Cada paso solo actúa si el host coincide y hay env.
 */
export function applyPlatformAffiliateTags(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  let out = trimmed;

  const mlTag = getPlatformMercadoLibreAffiliateTagLocal();
  if (mlTag && isMercadoLibreOfferUrlLocal(out)) {
    out = applyMercadoLibreAffiliateTagLocal(out, mlTag);
  }

  const amzTag = getEnv('AMAZON_ASSOCIATE_TAG', 'NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG');
  if (amzTag) {
    out = applyAmazonAssociate(out, amzTag);
  }

  const aliFcid = getEnv('ALIEXPRESS_AFF_FCID', 'NEXT_PUBLIC_ALIEXPRESS_AFF_FCID');
  if (aliFcid) {
    out = applyAliExpress(out, aliFcid);
  }

  const walmartParams = getEnv('WALMART_AFFILIATE_QUERY', 'NEXT_PUBLIC_WALMART_AFFILIATE_QUERY');
  if (walmartParams) {
    out = applyQueryParamsFromEnv(out, 'walmart.', walmartParams);
  }

  const sheinId = getEnv('SHEIN_AFF_ID', 'NEXT_PUBLIC_SHEIN_AFF_ID');
  if (sheinId) {
    out = applyShein(out, sheinId);
  }

  const temuPid = getEnv('TEMU_AFFILIATE_RP_PID', 'NEXT_PUBLIC_TEMU_AFFILIATE_RP_PID');
  if (temuPid) {
    out = applyTemu(out, temuPid);
  }

  return out;
}
