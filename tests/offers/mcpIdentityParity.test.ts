import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAndNormalizeAffiliateOfferUrl } from '@/lib/affiliate/resolveAffiliateOfferUrl';
import { normalizeCandidateUrl } from '@/lib/mcp/candidates';
import { resolveIngestionIdentity } from '@/lib/offers/ingestion/identity';
import { evaluateMachineCandidateAdmission } from '@/lib/offers/ingestion/machineCandidatePolicy';
import type { PreparedMachineCandidate } from '@/lib/offers/ingestion/prepareMachineCandidateOffer';
import { validatePublicOfferUrl } from '@/lib/server/validatePublicOfferUrl';

const prepared = {
  title: 'Arroz Verde Valle Super Extra 1 kg',
  price: 42,
  priceSource: 'retail_html',
  originalPrice: null,
  originalPriceSource: null,
} as unknown as PreparedMachineCandidate;

function admit(url: string) {
  return evaluateMachineCandidateAdmission({
    url,
    prepared,
    botDeclared: { price: null, originalPrice: null },
    isLowQualityTitle: () => false,
  });
}

/** Misma cadena que `ingestOfferObservation` usa para `offers.ingestion_identity_key`. */
async function persistedKey(url: string): Promise<string | null> {
  const checked = validatePublicOfferUrl(url);
  if (!checked.ok) throw new Error(checked.error);
  const normalized = await resolveAndNormalizeAffiliateOfferUrl(checked.href);
  return resolveIngestionIdentity(normalized || checked.href).key;
}

const REDIRECT_ASIN = 'B0REDIR001';
const network = {
  offline: async () => {
    throw new Error('offline');
  },
  redirect: async (input: string | URL) => {
    const host = new URL(String(input)).hostname;
    const location = /(^|\.)(amzn\.to|a\.co)$/.test(host)
      ? `https://www.amazon.com.mx/dp/${REDIRECT_ASIN}`
      : /mercadolibre|meli\.la/.test(host)
        ? 'https://articulo.mercadolibre.com.mx/MLM-999999999-redir'
        : null;
    return location
      ? new Response('', { status: 301, headers: { location } })
      : new Response('', { status: 200 });
  },
};

const ADMITTED = [
  'https://www.soriana.com/cereal-kelloggs-zucaritas-600-g/11669769.html',
  'https://www.walmart.com.mx/ip/arroz-verde-valle-1-kg/00750100811234',
  'https://www.chedraui.com.mx/arroz-verde-valle-1kg/p',
  'https://es.aliexpress.com/item/1005001234567890.html',
  'https://www.amazon.com.mx/dp/B0TESTASI1',
  'https://articulo.mercadolibre.com.mx/MLM-123456789-arroz',
  'https://www.liverpool.com.mx/tienda/pdp/arroz/1234567890',
];

const HELD = [
  'https://amzn.to/3AbCdEfG',
  'https://a.co/d/AbCdEfG',
  'https://www.amazon.com.mx/arroz-verde-valle-super-extra/x/abcdef',
  'https://www.mercadolibre.com.mx/sec/1AbCdEF',
  'https://meli.la/2AbCdEf',
];

describe('identidad MCP admitida = identidad que persiste el writer', () => {
  afterEach(() => vi.unstubAllGlobals());

  for (const mode of ['offline', 'redirect'] as const) {
    it.each(ADMITTED)(`${mode}: %s`, async (raw) => {
      vi.stubGlobal('fetch', vi.fn(network[mode]));
      const candidate = normalizeCandidateUrl(raw);
      expect(candidate.ok).toBe(true);
      if (!candidate.ok) return;
      const admission = admit(candidate.url);
      expect(admission.outcome).toBe('admit');
      if (admission.outcome !== 'admit') return;
      expect(admission.identityKey).toBe(await persistedKey(candidate.url));
    });
  }

  it.each(HELD)('enlace que el writer puede resolver a ASIN / item id: retenido (%s)', (raw) => {
    const candidate = normalizeCandidateUrl(raw);
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) return;
    expect(admit(candidate.url)).toEqual({ outcome: 'hold', code: 'NO_STRONG_IDENTITY' });
  });

  it('el defecto que evita la retención: el writer convierte amzn.to en amz:', async () => {
    vi.stubGlobal('fetch', vi.fn(network.redirect));
    expect(await persistedKey('https://amzn.to/3AbCdEfG')).toBe(`amz:${REDIRECT_ASIN}`);
    expect(resolveIngestionIdentity('https://amzn.to/3AbCdEfG').key).toBe('url:amzn.to/3abcdefg');
  });

  it('variantes de la misma URL canónica comparten clave; otra ruta es otro producto', () => {
    const key = (u: string) => {
      const a = admit(u);
      return a.outcome === 'admit' ? a.identityKey : null;
    };
    const base = key('https://www.soriana.com/cereal-kelloggs-zucaritas-600-g/11669769.html');
    expect(key('https://SORIANA.com/Cereal-Kelloggs-Zucaritas-600-g/11669769.html')).toBe(base);
    expect(key('https://www.soriana.com/cereal-kelloggs-zucaritas-600-g/11669769.html/')).toBe(base);
    expect(key('https://www.soriana.com/zucaritas-600g/11669769.html')).not.toBe(base);
  });

  it('MCP no admite query ni fragmento: los parámetros de seguimiento no llegan a la identidad', () => {
    expect(normalizeCandidateUrl('https://www.soriana.com/p/11669769.html?utm_source=x')).toEqual({ ok: false, code: 'INVALID_URL' });
    expect(normalizeCandidateUrl('https://www.soriana.com/p/11669769.html#x')).toEqual({ ok: false, code: 'INVALID_URL' });
  });
});
