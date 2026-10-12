/**
 * Cola editorial Hunters IA.
 * Los lotes siguen siendo la unidad de ingestión. Aquí la unidad de decisión es un candidato.
 */

/**
 * IN_MODERATION: el ítem ya tiene oferta `pending`; la decisión humana sigue en la cola de
 * moderación. APPROVED solo cuando la oferta quedó aprobada o publicada.
 */
export const HUNTER_QUEUE_STATUSES = ['PENDING', 'NEEDS_REVIEW', 'IN_MODERATION', 'APPROVED', 'REJECTED'] as const;
export type HunterQueueStatus = (typeof HUNTER_QUEUE_STATUSES)[number];

export const HUNTER_PAGE_SIZE = 24;
/** Ventana reciente sobre la que se deduplica y ordena. Cubre el objetivo de 70–200/día sin cargar el histórico. */
export const HUNTER_WINDOW = 300;
/** Tope de una acción masiva; se procesa en serie, ítem por ítem. */
export const HUNTER_BULK_MAX = 50;

const OPEN_DB_STATUSES = ['INGESTED', 'PROCESSING', 'READY', 'NEEDS_REVIEW', 'ERROR'];

/**
 * Estados de `offer_batch_items` que pueden caer en cada filtro editorial.
 * Se filtra en la consulta antes de la ventana para que los ítems cerrados no desplacen a los abiertos.
 */
export function pipelineStatusesFor(status: HunterQueueStatus | 'ALL'): string[] | null {
  if (status === 'PENDING' || status === 'NEEDS_REVIEW') return OPEN_DB_STATUSES;
  if (status === 'IN_MODERATION') return ['APPROVED'];
  if (status === 'APPROVED') return ['APPROVED', 'PUBLISHED'];
  if (status === 'REJECTED') return ['REJECTED', 'APPROVED'];
  return null;
}

export const DAILY_CATEGORIES = [
  'Hogar',
  'Limpieza',
  'Despensa',
  'Higiene',
  'Bebés',
  'Mascotas',
  'Salud/Cuidado personal',
  'Cocina',
] as const;

export const HUNTER_CATEGORIES = [...DAILY_CATEGORIES, 'Herramientas', 'Electrónica', 'Otros'] as const;
export type HunterCategory = (typeof HUNTER_CATEGORIES)[number];

export const HUNTER_RETAILERS = [
  'Amazon',
  'Mercado Libre',
  'Walmart',
  'Bodega Aurrera',
  'Sam\'s Club',
  'Soriana',
  'Costco',
  'Liverpool',
] as const;

export const REJECTION_REASONS = [
  { id: 'low_discount', label: 'Descuento insuficiente' },
  { id: 'weak_reference', label: 'Precio de referencia poco confiable' },
  { id: 'duplicate', label: 'Producto duplicado' },
  { id: 'worse_variant', label: 'Variante peor' },
  { id: 'bad_category', label: 'Mala categoría' },
  { id: 'untrusted_seller', label: 'Vendedor no confiable' },
  { id: 'availability', label: 'Disponibilidad' },
  { id: 'expired', label: 'Oferta terminada' },
  { id: 'incorrect', label: 'Información incorrecta' },
  { id: 'not_relevant', label: 'No es necesidad relevante' },
  { id: 'other', label: 'Otra' },
] as const;

export type RejectionReasonId = (typeof REJECTION_REASONS)[number]['id'];

export const HUNTER_SORTS = ['score', 'discount', 'savings', 'price', 'discovered'] as const;
export type HunterSort = (typeof HUNTER_SORTS)[number];

const OPEN_PIPELINE = new Set(['INGESTED', 'PROCESSING', 'READY']);
const EDIT_PIPELINE = new Set(['NEEDS_REVIEW', 'ERROR']);

export function editorialStatus(
  status: string,
  evidence: Record<string, unknown> | null | undefined,
  offerStatus: string | null = null,
): HunterQueueStatus {
  if (status === 'PUBLISHED') return 'APPROVED';
  if (status === 'APPROVED') {
    if (offerStatus === 'rejected') return 'REJECTED';
    if (offerStatus === 'approved' || offerStatus === 'published') return 'APPROVED';
    return 'IN_MODERATION';
  }
  if (status === 'REJECTED') return 'REJECTED';
  if (EDIT_PIPELINE.has(status)) return 'NEEDS_REVIEW';
  const editorial = evidence?.editorial;
  if (editorial && typeof editorial === 'object' && (editorial as { needs_edit?: unknown }).needs_edit === true) {
    return 'NEEDS_REVIEW';
  }
  if (OPEN_PIPELINE.has(status)) return 'PENDING';
  return 'PENDING';
}

export function isDailyCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  const needle = category.trim().toLowerCase();
  return DAILY_CATEGORIES.some((c) => c.toLowerCase() === needle);
}

export function rejectionLabel(id: string): string | null {
  return REJECTION_REASONS.find((r) => r.id === id)?.label ?? null;
}
