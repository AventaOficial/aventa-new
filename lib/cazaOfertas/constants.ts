/**
 * CazaOfertasss — FASE 0. Constantes de contrato.
 *
 * Toda constante que gobierne una decisión (umbral, peso, ventana de frescura)
 * vive aquí. Ningún módulo del dominio debe declarar magic numbers.
 */

export const CAZAOFERTAS_UNIT_ID = 'cazaofertasss' as const;
export const CAZAOFERTAS_SCHEMA_VERSION = 'caza.v0' as const;
export const CAZAOFERTAS_SCORE_VERSION = 'caza.score.v1' as const;

/** Mercados habilitados en FASE 0. Ampliar es una decisión explícita, no un default. */
export const CAZAOFERTAS_STORES = ['mercadolibre_mx', 'amazon_mx'] as const;

/** FASE 0 opera exclusivamente en México. */
export const CAZAOFERTAS_CURRENCIES = ['MXN'] as const;
export const CAZAOFERTAS_DEFAULT_CURRENCY = 'MXN' as const;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Pesos del DealScore. Suman exactamente SCORE_MAX; un test de contrato lo
 * verifica para que nadie desbalancee el score al agregar un componente.
 */
export const DEAL_SCORE_WEIGHTS = {
  discountStrength: 30,
  historicalPriceConfidence: 15,
  currentPriceConfidence: 15,
  evidenceQuality: 10,
  sellerQuality: 10,
  availability: 8,
  categoryRelevance: 7,
  couponPromotion: 5,
} as const;

export const DEAL_SCORE_MIN = 0;
export const DEAL_SCORE_MAX = 100;

export const DEAL_SCORE_GRADE_THRESHOLDS = {
  GREAT_DEAL: 85,
  GOOD_DEAL: 70,
} as const;

/** Descuento a partir del cual el componente `discountStrength` satura. */
export const DISCOUNT_SATURATION_PERCENT = 50;
/** Descuento mínimo para que una oferta sea siquiera candidata a publicación. */
export const MIN_PUBLISHABLE_DISCOUNT_PERCENT = 15;
/** Descuento por encima del cual se exige evidencia histórica observada. */
export const IMPLAUSIBLE_DISCOUNT_PERCENT = 80;

// ---------------------------------------------------------------------------
// Evidence / frescura
// ---------------------------------------------------------------------------

/** Una evidencia más vieja que esto no puede sostener una publicación. */
export const EVIDENCE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 h
/** Ventana mínima de historial para afirmar un precio de referencia observado. */
export const HISTORY_MIN_WINDOW_DAYS = 14;
/** Observaciones mínimas dentro de la ventana para confiar en el historial. */
export const HISTORY_MIN_OBSERVATIONS = 5;

// ---------------------------------------------------------------------------
// Precios
// ---------------------------------------------------------------------------

/** Precio mínimo aceptable. Cero y negativos son datos corruptos, no gangas. */
export const PRICE_MIN_VALUE = 0.01;
/** Techo defensivo contra overflow/valores absurdos de fuentes no confiables. */
export const PRICE_MAX_VALUE = 10_000_000;
/** Decimales canónicos de MXN. */
export const PRICE_DECIMALS = 2;

// ---------------------------------------------------------------------------
// Identidad y tracking
// ---------------------------------------------------------------------------

export const EXTERNAL_PRODUCT_ID_MAX_LENGTH = 128;
export const TRACKING_LABEL_PATTERN = /^[a-z0-9_]{6,64}$/;
export const TITLE_MAX_LENGTH = 300;
export const URL_MAX_LENGTH = 2048;

/** Query params que nunca forman parte de la identidad canónica. */
export const IDENTITY_STRIPPED_QUERY_PREFIXES = ['utm_', 'matt_', 'mkt_', 'pf_'] as const;
export const IDENTITY_STRIPPED_QUERY_KEYS = [
  'tag',
  'ref',
  'ref_',
  'linkcode',
  'ascsubtag',
  'creative',
  'creativeasin',
  'th',
  'psc',
  'gclid',
  'fbclid',
  'quantity',
  'variation_id',
  'tracking_id',
  'forceinapp',
  'deal_print_id',
  'position',
  'search_layout',
  'type',
  'reco_id',
  'c_id',
  'c_campaign',
  'c_uid',
] as const;

// ---------------------------------------------------------------------------
// Fronteras (fail-closed)
// ---------------------------------------------------------------------------

/**
 * Frontera económica. CazaOfertasss es una capa de ejecución comercial: NO
 * escribe en el money path de Aventa y no lo hará por accidente.
 */
export const CAZAOFERTAS_AVENTA_BOUNDARY = {
  unit: CAZAOFERTAS_UNIT_ID,
  writesAventaLedger: false,
  writesAventaRewards: false,
  writesAventaPayoutIntents: false,
  writesAventaCommissions: false,
  readsAventaEconomicTables: false,
  settlementEnabled: false,
  sharesEconomicTables: false,
  integrationStyle: 'contracts_and_events_only',
} as const;

/**
 * Frontera de publicación.
 *
 * - `telegramPublishEnabled` / `autoPublishEnabled`: SIEMPRE false en FASE 2.
 *   La producción no publica.
 * - Canary: sólo vía gate explícito (`CAZAOFERTAS_TELEGRAM_CANARY=1`) + canal
 *   allowlisted + credential ref. No se enciende con esta constante.
 */
export const CAZAOFERTAS_PUBLICATION_BOUNDARY = {
  telegramPublishEnabled: false,
  telegramCardGenerationEnabled: true,
  autoPublishEnabled: false,
  /** La ruta canary existe; no implica que esté habilitada. */
  canaryPathExists: true,
} as const;

/** Env var que contiene el token del bot. Nunca el valor. */
export const CAZAOFERTAS_TELEGRAM_BOT_TOKEN_ENV = 'CAZAOFERTAS_TELEGRAM_BOT_TOKEN' as const;
/** Gate canary: debe ser exactamente `'1'`. */
export const CAZAOFERTAS_TELEGRAM_CANARY_ENV = 'CAZAOFERTAS_TELEGRAM_CANARY' as const;
/** Allowlist de canales canary, separados por coma. */
export const CAZAOFERTAS_TELEGRAM_CANARY_CHANNELS_ENV =
  'CAZAOFERTAS_TELEGRAM_CANARY_CHANNELS' as const;

// ---------------------------------------------------------------------------
// Outbox / retries
// ---------------------------------------------------------------------------

/** Intentos máximos de envío antes de FAILED terminal. */
export const PUBLICATION_MAX_ATTEMPTS = 5;
/** Duración del lease SENDING (crash recovery). */
export const PUBLICATION_LEASE_MS = 60_000;
/** Backoff base (ms) para errores retryable (429 / 5xx). */
export const PUBLICATION_RETRY_BASE_MS = 2_000;
/** Tope de backoff (ms). */
export const PUBLICATION_RETRY_MAX_MS = 15 * 60 * 1000;
/** Timeout HTTP del adapter Telegram. */
export const TELEGRAM_HTTP_TIMEOUT_MS = 15_000;
/** Límite duro por drain del outbox. */
export const PUBLICATION_DRAIN_MAX_BATCH = 25;

/** El LLM nunca es autoridad de precio, descuento ni score. */
export const CAZAOFERTAS_LLM_AUTHORITY = {
  priceAuthority: false,
  discountAuthority: false,
  scoreAuthority: false,
  allowedUses: ['copywriting_assistance_only'],
} as const;

/**
 * Imports prohibidos dentro de `lib/cazaOfertas/**`. Un test de contrato
 * escanea el módulo para que la independencia no dependa de la disciplina.
 */
export const CAZAOFERTAS_FORBIDDEN_IMPORT_PATTERNS = [
  'lib/rewards',
  'lib/economy',
  'lib/commissions',
  'lib/finance',
  'lib/dealAlerts',
  'lib/dealIntelligence',
  'lib/distribution',
  'lib/supplyIntelligence',
] as const;

/** Los secretos de afiliación se referencian por nombre de env var, nunca por valor. */
export const CAZAOFERTAS_SECRET_POLICY = {
  storeSecretsInCode: false,
  exposeSecretsToClient: false,
  referenceStyle: 'env_var_name_only',
} as const;
