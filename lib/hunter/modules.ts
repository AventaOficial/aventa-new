export type HunterModuleStatus = 'live' | 'partial' | 'planned';

export type HunterModule = {
  id: string;
  emoji: string;
  name: string;
  job: string;
  status: HunterModuleStatus;
  code: string;
};

/** Los 8 sistemas del Cazador. No es una IA monolítica: cada uno ya existe o se enchufa aquí. */
export const HUNTER_MODULES: HunterModule[] = [
  {
    id: 'collector',
    emoji: '🔎',
    name: 'Recolector',
    job: 'APIs y feeds → candidatos. ML search, Amazon ASINs/PA-API, URLs y worker.',
    status: 'live',
    code: 'lib/bots/ingest/collectIngestItems.ts',
  },
  {
    id: 'price',
    emoji: '🧠',
    name: 'Price Engine',
    job: 'Historial propio 30/90 días en Mercado Libre y Keepa en Amazon. Detecta descuento de etiqueta falso.',
    status: 'live',
    code: 'lib/bots/ingest/mlPriceEngine.ts',
  },
  {
    id: 'coupon',
    emoji: '🎟️',
    name: 'Coupon Hunter',
    job: 'Códigos, MSI, envío gratis y primera compra. Todavía no caza cupones solo.',
    status: 'planned',
    code: 'lib/bankCoupons.ts',
  },
  {
    id: 'bank',
    emoji: '💳',
    name: 'Bank Hunter',
    job: 'Reglas BBVA/otros → precio efectivo. Los cupones bancarios ya se marcan al subir.',
    status: 'planned',
    code: 'lib/bankCoupons.ts',
  },
  {
    id: 'scorer',
    emoji: '🤖',
    name: 'Deal Scorer',
    job: 'Aventa Score 0–100 y decisión: ignorar / cola / auto-publicar.',
    status: 'live',
    code: 'lib/bots/ingest/scoreIngestCandidate.ts',
  },
  {
    id: 'copy',
    emoji: '✍️',
    name: 'Copy Agent',
    job: 'Título limpio. Nunca inventa precio, cupón ni stock.',
    status: 'partial',
    code: 'lib/bots/ingest/optimizeIngestTitle.ts',
  },
  {
    id: 'affiliate',
    emoji: '🔗',
    name: 'Affiliate Engine',
    job: 'Tag Amazon / ML en el enlace canónico antes de publicar.',
    status: 'live',
    code: 'lib/affiliate/applyPlatformAffiliateTags.ts',
  },
  {
    id: 'publisher',
    emoji: '🚀',
    name: 'Publisher',
    job: 'Inserta, respeta cupo diario y manda a cola o feed según el score.',
    status: 'live',
    code: 'lib/bots/ingest/insertIngestedOffer.ts',
  },
];
