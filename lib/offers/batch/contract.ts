/**
 * Batch Ingestion v2 — contrato de dominio (puro, sin I/O).
 *
 * Reglas:
 *  - Un ítem sólo cambia de estado por una transición declarada aquí.
 *  - Los códigos técnicos (warnings / errores) se mantienen estables; el texto
 *    para operadores vive en `describeBatchCode`.
 *  - Nunca se inventa precio ni se convierte «precio histórico» en «precio original».
 */

export const OFFER_BATCH_MAX_ITEMS = 100;

/** Ítems que procesa una sola llamada a /process (mantiene la request < 60 s). */
export const OFFER_BATCH_PROCESS_CHUNK = 4;

/** Ítems en PROCESSING con lease vencido se reclaman (crash / timeout del servidor). */
export const OFFER_BATCH_LEASE_MS = 2 * 60 * 1000;

/** Reintentos automáticos antes de dejar el ítem en ERROR definitivo (el operador puede forzar). */
export const OFFER_BATCH_MAX_AUTO_ATTEMPTS = 3;

export const BATCH_ITEM_STATUSES = [
  'INGESTED',
  'PROCESSING',
  'READY',
  'NEEDS_REVIEW',
  'ERROR',
  'APPROVED',
  'PUBLISHED',
  'REJECTED',
] as const;
export type BatchItemStatus = (typeof BATCH_ITEM_STATUSES)[number];

/**
 * Trabajo de moderación que ocupa la identidad del producto.
 * PUBLISHED y REJECTED quedan fuera: un rechazo o una publicación permiten reintentar.
 */
export const OPEN_ACQUISITION_ITEM_STATUSES = [
  'INGESTED',
  'PROCESSING',
  'READY',
  'NEEDS_REVIEW',
  'ERROR',
  'APPROVED',
] as const satisfies readonly BatchItemStatus[];

export const BATCH_STATUSES = ['draft', 'processing', 'ready', 'completed', 'archived'] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export type BatchItemAction =
  | 'process'
  | 'approve'
  | 'reject'
  | 'reprocess'
  | 'edit'
  | 'change_url'
  | 'sync_published'
  | 'sync_rejected';

const TRANSITIONS: Record<BatchItemStatus, readonly BatchItemStatus[]> = {
  INGESTED: ['PROCESSING', 'REJECTED'],
  PROCESSING: ['READY', 'NEEDS_REVIEW', 'ERROR', 'INGESTED'],
  READY: ['PROCESSING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW'],
  NEEDS_REVIEW: ['PROCESSING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW', 'READY'],
  ERROR: ['PROCESSING', 'REJECTED', 'NEEDS_REVIEW'],
  APPROVED: ['PUBLISHED', 'REJECTED'],
  PUBLISHED: [],
  REJECTED: ['PROCESSING'],
};

export function isBatchItemStatus(value: unknown): value is BatchItemStatus {
  return typeof value === 'string' && (BATCH_ITEM_STATUSES as readonly string[]).includes(value);
}

export function canTransition(from: BatchItemStatus, to: BatchItemStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Estados desde los que el operador puede aprobar (crear la oferta pending). */
export function canApproveFrom(status: BatchItemStatus): boolean {
  return status === 'READY' || status === 'NEEDS_REVIEW';
}

/** Estados desde los que se puede reprocesar. Un ítem ya aprobado tiene oferta: no se reprocesa. */
export function canReprocessFrom(status: BatchItemStatus, hasOffer: boolean): boolean {
  if (hasOffer) return false;
  return status === 'READY' || status === 'NEEDS_REVIEW' || status === 'ERROR' || status === 'REJECTED' || status === 'INGESTED';
}

/**
 * Rechazo por operador. Un ítem APPROVED ya tiene oferta pending: se rechaza
 * desde la cola de moderación (moderate-offer), no desde el lote.
 */
export function canRejectFrom(status: BatchItemStatus): boolean {
  return status !== 'PUBLISHED' && status !== 'REJECTED' && status !== 'APPROVED';
}

export function canEditFrom(status: BatchItemStatus): boolean {
  return status === 'READY' || status === 'NEEDS_REVIEW' || status === 'ERROR';
}

/** Terminal para el operador: no hay acción pendiente sobre el ítem. */
export function isTerminalStatus(status: BatchItemStatus): boolean {
  return status === 'PUBLISHED' || status === 'REJECTED';
}

/* ---------------------------------------------------------------------------
 * Códigos (estables) → texto operador
 * ------------------------------------------------------------------------- */

export type BatchWarningCode =
  | 'NO_ORIGINAL_PRICE'
  | 'NO_PRICE'
  | 'NO_IMAGES'
  | 'FEW_IMAGES'
  | 'NO_TITLE'
  | 'PARTIAL_EXTRACTION'
  | 'LOW_IDENTITY_CONFIDENCE'
  | 'PRICE_MISMATCH_HINT'
  | 'HINT_ORIGINAL_IGNORED'
  | 'DISCOUNT_SUSPICIOUS'
  | 'STORE_NO_AFFILIATE'
  | 'MANUAL_EDIT'
  | 'URL_CHANGED'
  | 'RETAILER_UNSUPPORTED';

export type BatchErrorCode =
  | 'INVALID_URL'
  | 'BLOCKED_HOST'
  | 'EXTRACTION_FAILED'
  | 'DUPLICATE_OFFER'
  | 'DUPLICATE_IN_BATCH'
  | 'MISSING_REQUIRED_FIELDS'
  | 'WRITER_REJECTED'
  | 'WRITER_DUPLICATE'
  | 'WRITER_FAILED'
  | 'RETRY_EXHAUSTED'
  | 'UNKNOWN';

export type BatchCodeDescription = {
  label: string;
  hint: string | null;
  severity: 'info' | 'warning' | 'error';
};

const CODE_TEXT: Record<BatchWarningCode | BatchErrorCode, BatchCodeDescription> = {
  NO_ORIGINAL_PRICE: {
    label: 'Sin precio anterior comprobable',
    hint: 'La tienda no mostró un precio anterior. Se publicará sólo con el precio actual; no lo inventes.',
    severity: 'warning',
  },
  NO_PRICE: {
    label: 'Sin precio',
    hint: 'No se pudo leer el precio. Ábrelo en la tienda y escríbelo antes de aprobar.',
    severity: 'warning',
  },
  NO_IMAGES: {
    label: 'Sin fotos',
    hint: 'No se obtuvieron fotos confiables. Reprocesa o cambia la URL por la ficha del producto.',
    severity: 'warning',
  },
  FEW_IMAGES: {
    label: 'Pocas fotos',
    hint: 'Sólo se obtuvo una foto confiable.',
    severity: 'info',
  },
  NO_TITLE: {
    label: 'Sin título',
    hint: 'Escribe el título del producto antes de aprobar.',
    severity: 'warning',
  },
  PARTIAL_EXTRACTION: {
    label: 'Datos incompletos',
    hint: 'La tienda devolvió sólo parte de la ficha. Revisa título, fotos y precio.',
    severity: 'warning',
  },
  LOW_IDENTITY_CONFIDENCE: {
    label: 'Producto no confirmado',
    hint: 'No se pudo confirmar el producto exacto desde la URL. Verifica que sea la ficha correcta.',
    severity: 'warning',
  },
  PRICE_MISMATCH_HINT: {
    label: 'Precio distinto al del texto pegado',
    hint: 'El precio leído en la tienda no coincide con el que venía en el texto. Se usa el de la tienda.',
    severity: 'info',
  },
  HINT_ORIGINAL_IGNORED: {
    label: 'Precio anterior del texto ignorado',
    hint: 'El texto traía un precio anterior, pero la tienda no lo respalda. No se usa.',
    severity: 'info',
  },
  DISCOUNT_SUSPICIOUS: {
    label: 'Descuento muy alto',
    hint: 'Más de 80 % de descuento. Confirma en la tienda que el precio anterior sea real.',
    severity: 'warning',
  },
  STORE_NO_AFFILIATE: {
    label: 'Tienda sin enlace de afiliado automático',
    hint: 'Se publicará con enlace normal; puedes pegar el afiliado en la cola de moderación.',
    severity: 'info',
  },
  MANUAL_EDIT: {
    label: 'Editado a mano',
    hint: 'Un operador cambió datos de este ítem.',
    severity: 'info',
  },
  URL_CHANGED: {
    label: 'URL corregida',
    hint: 'La URL fue reemplazada y el ítem se volvió a procesar.',
    severity: 'info',
  },
  RETAILER_UNSUPPORTED: {
    label: 'Tienda sin soporte específico',
    hint: 'Se usó lectura genérica de la página. Revisa los datos con cuidado.',
    severity: 'info',
  },
  INVALID_URL: {
    label: 'Enlace inválido',
    hint: 'No es una URL https válida de tienda.',
    severity: 'error',
  },
  BLOCKED_HOST: {
    label: 'Tienda no permitida',
    hint: 'Este dominio no está en la lista de tiendas permitidas.',
    severity: 'error',
  },
  EXTRACTION_FAILED: {
    label: 'No se pudo leer el producto',
    hint: 'La tienda no respondió o bloqueó la lectura. Reintenta o cambia la URL por la ficha completa.',
    severity: 'error',
  },
  DUPLICATE_OFFER: {
    label: 'Ya existe en Aventa',
    hint: 'Hay una oferta pendiente o publicada del mismo producto.',
    severity: 'error',
  },
  DUPLICATE_IN_BATCH: {
    label: 'Repetido en este lote',
    hint: 'La misma URL ya está en el lote.',
    severity: 'error',
  },
  MISSING_REQUIRED_FIELDS: {
    label: 'Faltan datos obligatorios',
    hint: 'Se necesita título, precio y al menos una foto para aprobar.',
    severity: 'error',
  },
  WRITER_REJECTED: {
    label: 'Rechazado por validación',
    hint: 'La oferta no pasó las validaciones al crearse. Revisa los datos.',
    severity: 'error',
  },
  WRITER_DUPLICATE: {
    label: 'Duplicado al crear',
    hint: 'Otra oferta del mismo producto se creó antes.',
    severity: 'error',
  },
  WRITER_FAILED: {
    label: 'Error al crear la oferta',
    hint: 'Fallo interno al guardar. Reintenta.',
    severity: 'error',
  },
  RETRY_EXHAUSTED: {
    label: 'Se agotaron los reintentos automáticos',
    hint: 'Puedes reprocesar manualmente.',
    severity: 'error',
  },
  UNKNOWN: {
    label: 'Error desconocido',
    hint: 'Reintenta. Si persiste, reporta el ítem.',
    severity: 'error',
  },
};

export function describeBatchCode(code: string): BatchCodeDescription {
  return (
    (CODE_TEXT as Record<string, BatchCodeDescription | undefined>)[code] ?? {
      label: 'Requiere revisión',
      hint: null,
      severity: 'warning',
    }
  );
}

/** Avisos informativos: no bloquean y no se repiten como fila principal. */
const SECONDARY_WARNING_CODES = new Set<string>([
  'FEW_IMAGES',
  'STORE_NO_AFFILIATE',
  'PRICE_MISMATCH_HINT',
  'HINT_ORIGINAL_IGNORED',
  'MANUAL_EDIT',
  'URL_CHANGED',
  'RETAILER_UNSUPPORTED',
  'NO_ORIGINAL_PRICE',
]);

export type BatchItemPresentation = {
  /** Una sola línea para la card. null si no hay problema que decidir. */
  primaryIssue: string | null;
  primarySeverity: 'info' | 'warning' | 'error' | null;
  /** Estado humano (nunca el enum). */
  statusLabel: string;
  /** Avisos para «Ver detalles». El código técnico va aparte, no como título. */
  details: Array<{ label: string; hint: string | null; code: string }>;
};

/**
 * Capa de presentación. Los códigos siguen en el ítem; aquí solo se traduce.
 * No inventa cupones ni convierte una ausencia en error.
 */
export function presentBatchItem(input: {
  status: BatchItemStatus;
  errorCode: string | null;
  warnings: string[];
  duplicateStatus?: string | null;
}): BatchItemPresentation {
  const statusLabel = BATCH_ITEM_STATUS_LABEL[input.status] ?? 'En proceso';
  const details = [
    ...(input.errorCode ? [input.errorCode] : []),
    ...input.warnings,
  ]
    .filter((code, i, all) => all.indexOf(code) === i)
    .map((code) => {
      const described = describeBatchCode(code);
      const known = code in CODE_TEXT;
      return {
        code,
        label: known ? described.label : 'Aviso interno',
        hint: described.hint,
      };
    });

  if (input.duplicateStatus === 'duplicate' || input.duplicateStatus === 'in_batch') {
    const dup = describeBatchCode('DUPLICATE_OFFER');
    return {
      primaryIssue: dup.label,
      primarySeverity: 'error',
      statusLabel,
      details,
    };
  }

  if (input.errorCode) {
    const err = describeBatchCode(input.errorCode);
    return {
      primaryIssue: err.label,
      primarySeverity: 'error',
      statusLabel,
      details,
    };
  }

  const blocking = input.warnings.find(
    (code) => code in CODE_TEXT && !SECONDARY_WARNING_CODES.has(code),
  );
  if (blocking) {
    const w = describeBatchCode(blocking);
    return {
      primaryIssue: w.label,
      primarySeverity: w.severity === 'error' ? 'error' : 'warning',
      statusLabel,
      details,
    };
  }

  return { primaryIssue: null, primarySeverity: null, statusLabel, details };
}

export const BATCH_ITEM_STATUS_LABEL: Record<BatchItemStatus, string> = {
  INGESTED: 'En cola',
  PROCESSING: 'Procesando',
  READY: 'Listo',
  NEEDS_REVIEW: 'Revisar',
  ERROR: 'Error',
  APPROVED: 'Aprobado',
  PUBLISHED: 'Publicado',
  REJECTED: 'Rechazado',
};

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  draft: 'Nuevo',
  processing: 'Procesando',
  ready: 'Listo para revisar',
  completed: 'Completado',
  archived: 'Archivado',
};

/* ---------------------------------------------------------------------------
 * Evaluación pura del resultado de extracción → estado del ítem
 * ------------------------------------------------------------------------- */

export type BatchExtractionInput = {
  extractionStatus: 'success' | 'partial' | 'failed';
  title: string | null;
  images: string[];
  price: number | null;
  originalPrice: number | null;
  provider: string;
  identityConfidence: 'high' | 'medium' | 'low' | string;
  hasIdentity: boolean;
  blockedByHostPolicy: boolean;
  invalidUrl: boolean;
  hintPrice: number | null;
  hintOriginalPrice: number | null;
  duplicate: { offerId: string; status: string | null } | null;
  storeHasAffiliate: boolean;
};

export type BatchEvaluation = {
  status: Extract<BatchItemStatus, 'READY' | 'NEEDS_REVIEW' | 'ERROR'>;
  validationStatus: 'ok' | 'invalid_url' | 'blocked_host' | 'missing_fields';
  duplicateStatus: 'none' | 'duplicate';
  errorCode: BatchErrorCode | null;
  warnings: BatchWarningCode[];
  discountPercent: number | null;
  /** Precio anterior aceptado (sólo si la tienda lo respalda). */
  originalPrice: number | null;
};

export function computeDiscountPercent(price: number | null, original: number | null): number | null {
  if (price == null || original == null) return null;
  if (!(price > 0) || !(original > price)) return null;
  return Math.round(((original - price) / original) * 100);
}

/**
 * Decide READY / NEEDS_REVIEW / ERROR sin tocar I/O.
 *
 * READY exige: título, precio > 0, ≥1 foto, sin duplicado, identidad razonable.
 * El precio anterior nunca se toma del texto pegado: si la tienda no lo respalda, va null.
 */
export function evaluateBatchExtraction(input: BatchExtractionInput): BatchEvaluation {
  const warnings: BatchWarningCode[] = [];

  if (input.invalidUrl) {
    return {
      status: 'ERROR',
      validationStatus: 'invalid_url',
      duplicateStatus: 'none',
      errorCode: 'INVALID_URL',
      warnings,
      discountPercent: null,
      originalPrice: null,
    };
  }
  if (input.blockedByHostPolicy) {
    return {
      status: 'ERROR',
      validationStatus: 'blocked_host',
      duplicateStatus: 'none',
      errorCode: 'BLOCKED_HOST',
      warnings,
      discountPercent: null,
      originalPrice: null,
    };
  }

  const price = input.price != null && input.price > 0 ? input.price : null;
  let original = input.originalPrice != null && input.originalPrice > 0 ? input.originalPrice : null;
  if (original != null && price != null && original <= price) original = null;

  if (input.hintOriginalPrice != null && original == null) warnings.push('HINT_ORIGINAL_IGNORED');
  if (
    input.hintPrice != null &&
    price != null &&
    Math.abs(input.hintPrice - price) / Math.max(price, 1) > 0.02
  ) {
    warnings.push('PRICE_MISMATCH_HINT');
  }

  if (input.duplicate) {
    return {
      status: 'NEEDS_REVIEW',
      validationStatus: 'ok',
      duplicateStatus: 'duplicate',
      errorCode: 'DUPLICATE_OFFER',
      warnings,
      discountPercent: computeDiscountPercent(price, original),
      originalPrice: original,
    };
  }

  if (input.extractionStatus === 'failed') {
    return {
      status: 'ERROR',
      validationStatus: 'missing_fields',
      duplicateStatus: 'none',
      errorCode: 'EXTRACTION_FAILED',
      warnings,
      discountPercent: null,
      originalPrice: null,
    };
  }

  if (!input.title) warnings.push('NO_TITLE');
  if (price == null) warnings.push('NO_PRICE');
  if (input.images.length === 0) warnings.push('NO_IMAGES');
  else if (input.images.length === 1) warnings.push('FEW_IMAGES');
  if (original == null) warnings.push('NO_ORIGINAL_PRICE');
  if (input.extractionStatus === 'partial') warnings.push('PARTIAL_EXTRACTION');
  if (!input.hasIdentity || input.identityConfidence === 'low') warnings.push('LOW_IDENTITY_CONFIDENCE');
  if (input.provider === 'unknown') warnings.push('RETAILER_UNSUPPORTED');
  if (!input.storeHasAffiliate) warnings.push('STORE_NO_AFFILIATE');

  const discount = computeDiscountPercent(price, original);
  if (discount != null && discount > 80) warnings.push('DISCOUNT_SUSPICIOUS');

  const missingRequired = !input.title || price == null || input.images.length === 0;
  if (missingRequired) {
    return {
      status: 'NEEDS_REVIEW',
      validationStatus: 'missing_fields',
      duplicateStatus: 'none',
      errorCode: null,
      warnings,
      discountPercent: discount,
      originalPrice: original,
    };
  }

  const needsHumanEye =
    warnings.includes('LOW_IDENTITY_CONFIDENCE') ||
    warnings.includes('DISCOUNT_SUSPICIOUS') ||
    warnings.includes('RETAILER_UNSUPPORTED') ||
    warnings.includes('PARTIAL_EXTRACTION');

  return {
    status: needsHumanEye ? 'NEEDS_REVIEW' : 'READY',
    validationStatus: 'ok',
    duplicateStatus: 'none',
    errorCode: null,
    warnings,
    discountPercent: discount,
    originalPrice: original,
  };
}

/* ---------------------------------------------------------------------------
 * Contadores del lote
 * ------------------------------------------------------------------------- */

export type BatchCounters = {
  total_items: number;
  pending_items: number;
  ready_items: number;
  review_items: number;
  error_items: number;
  approved_items: number;
  published_items: number;
  rejected_items: number;
  duplicate_items: number;
};

export function countBatchItems(
  items: Array<{ status: BatchItemStatus; duplicate_status?: string | null }>,
): BatchCounters {
  const c: BatchCounters = {
    total_items: items.length,
    pending_items: 0,
    ready_items: 0,
    review_items: 0,
    error_items: 0,
    approved_items: 0,
    published_items: 0,
    rejected_items: 0,
    duplicate_items: 0,
  };
  for (const it of items) {
    switch (it.status) {
      case 'INGESTED':
      case 'PROCESSING':
        c.pending_items++;
        break;
      case 'READY':
        c.ready_items++;
        break;
      case 'NEEDS_REVIEW':
        c.review_items++;
        break;
      case 'ERROR':
        c.error_items++;
        break;
      case 'APPROVED':
        c.approved_items++;
        break;
      case 'PUBLISHED':
        c.published_items++;
        break;
      case 'REJECTED':
        c.rejected_items++;
        break;
    }
    if (it.duplicate_status === 'duplicate' || it.duplicate_status === 'in_batch') c.duplicate_items++;
  }
  return c;
}

export function deriveBatchStatus(counters: BatchCounters, current: BatchStatus): BatchStatus {
  if (current === 'archived') return 'archived';
  if (counters.total_items === 0) return 'draft';
  if (counters.pending_items > 0) return 'processing';
  const open = counters.ready_items + counters.review_items + counters.error_items + counters.approved_items;
  if (open === 0) return 'completed';
  return 'ready';
}

/* ---------------------------------------------------------------------------
 * Resumen de acciones masivas
 * ------------------------------------------------------------------------- */

export type BulkItemResult = {
  itemId: string;
  ok: boolean;
  status: BatchItemStatus | null;
  code: string | null;
  message: string | null;
  offerId?: string | null;
};

export type BulkSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  results: BulkItemResult[];
};

export function summarizeBulk(results: BulkItemResult[]): BulkSummary {
  return {
    processed: results.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
