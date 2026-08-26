import { z } from 'zod';

/**
 * Todos los campos llevan mensaje en español. Un error sin texto útil (el
 * «Invalid input» por defecto de Zod) deja al usuario sin saber qué arreglar y
 * abandona la publicación.
 */

const optionalTrimmedString = z
  .string({ error: 'Debe ser texto' })
  .trim()
  .transform((v) => (v.length > 0 ? v : ''))
  .optional();

const optionalNullableString = z
  .union([z.string(), z.null(), z.undefined()], { error: 'Debe ser texto' })
  .transform((v) => (typeof v === 'string' ? v.trim() : null));

/**
 * Precios: acepta número, texto numérico, vacío, null o ausencia, y siempre
 * devuelve `number | undefined`.
 *
 * Antes era `union([number, string]).optional()`, que rechaza `null`. El
 * formulario manda `original_price: null` cuando la oferta no tiene descuento,
 * así que publicar sin descuento fallaba siempre con «Invalid input».
 */
const optionalNumberLike = z
  .union([z.number(), z.string(), z.null(), z.undefined()], {
    error: 'Escribe un precio válido, solo números',
  })
  .transform((v) => {
    if (v == null) return undefined;
    if (typeof v === 'string' && v.trim() === '') return undefined;
    return Number(v);
  })
  .refine((v) => v === undefined || Number.isFinite(v), {
    message: 'Escribe un precio válido, solo números',
  });

export const createOfferInputSchema = z
  .object({
    title: z
      .string({ error: 'Escribe el título de la oferta' })
      .trim()
      .min(1, 'Escribe el título de la oferta')
      .max(500, 'El título no puede pasar de 500 caracteres'),
    store: z
      .string({ error: 'Escribe la tienda' })
      .trim()
      .min(1, 'Escribe la tienda')
      .max(200, 'El nombre de la tienda no puede pasar de 200 caracteres'),
    hasDiscount: z
      .boolean({ error: 'Indica si la oferta tiene descuento' })
      .optional()
      .default(true),
    price: optionalNumberLike,
    original_price: optionalNumberLike,
    image_url: optionalNullableString,
    image_urls: z
      .array(
        z
          .string({ error: 'Cada foto debe ser una dirección de imagen' })
          .trim()
          .min(1, 'Hay una foto sin dirección')
          .max(4096, 'La dirección de una foto es demasiado larga'),
        { error: 'Las fotos deben venir en una lista' }
      )
      .max(8, 'Máximo 8 fotos por oferta')
      .optional()
      .default([]),
    msi_months: z
      .union([z.number().int(), z.null(), z.undefined()], {
        error: 'Los meses sin intereses deben ser un número entero',
      })
      .transform((v) => (typeof v === 'number' ? v : null))
      .refine((v) => v == null || (v >= 1 && v <= 24), {
        message: 'Los meses sin intereses deben estar entre 1 y 24',
      }),
    offer_url: optionalTrimmedString,
    description: optionalTrimmedString,
    steps: optionalTrimmedString,
    conditions: optionalTrimmedString,
    coupons: optionalTrimmedString,
    category: optionalNullableString,
    bank_coupon: optionalNullableString,
    tags: z
      .array(
        z
          .string({ error: 'Cada etiqueta debe ser texto' })
          .trim()
          .min(1, 'Hay una etiqueta vacía')
          .max(80, 'Una etiqueta no puede pasar de 80 caracteres'),
        { error: 'Las etiquetas deben venir en una lista' }
      )
      .max(20, 'Máximo 20 etiquetas')
      .optional()
      .default([]),
    moderator_comment: z
      .string({ error: 'La nota para moderadores debe ser texto' })
      .trim()
      .max(500, 'La nota para moderadores no puede pasar de 500 caracteres')
      .optional(),
  })
  .superRefine((data, ctx) => {
    const hasDiscount = data.hasDiscount !== false;
    const hasPrice = typeof data.price === 'number' && Number.isFinite(data.price);
    const hasOriginal =
      typeof data.original_price === 'number' && Number.isFinite(data.original_price);

    if (hasDiscount && !hasPrice) {
      ctx.addIssue({
        code: 'custom',
        path: ['price'],
        message: 'Escribe el precio con descuento',
      });
    }

    if (hasPrice && data.price! < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['price'],
        message: 'El precio no puede ser negativo',
      });
    }

    if (hasOriginal && data.original_price! < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['original_price'],
        message: 'El precio original no puede ser negativo',
      });
    }
  });

export type CreateOfferInput = z.infer<typeof createOfferInputSchema>;

/** Nombres visibles de cada campo, para que el error diga qué revisar. */
const OFFER_FIELD_LABELS: Record<string, string> = {
  title: 'Título',
  store: 'Tienda',
  hasDiscount: 'Descuento',
  price: 'Precio con descuento',
  original_price: 'Precio original',
  image_url: 'Foto principal',
  image_urls: 'Fotos',
  msi_months: 'Meses sin intereses',
  offer_url: 'Enlace de la oferta',
  description: 'Descripción',
  steps: 'Pasos',
  conditions: 'Condiciones',
  coupons: 'Cupón',
  category: 'Categoría',
  bank_coupon: 'Cupón bancario',
  tags: 'Etiquetas',
  moderator_comment: 'Nota para moderadores',
};

/** Convierte un issue de la API en una frase que le sirve al usuario. */
export function describeOfferIssue(issue: {
  path?: string | null;
  message?: string | null;
}): string | null {
  const message = issue.message?.trim();
  if (!message) return null;
  const field = issue.path?.split('.')[0] ?? '';
  const label = OFFER_FIELD_LABELS[field];
  return label ? `${label}: ${message}` : message;
}
