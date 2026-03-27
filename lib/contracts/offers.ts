import { z } from 'zod';

const optionalTrimmedString = z
  .string()
  .trim()
  .transform((v) => (v.length > 0 ? v : ''))
  .optional();

const optionalNullableString = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (typeof v === 'string' ? v.trim() : null));

const numberLike = z
  .union([z.number(), z.string()])
  .transform((v) => Number(v))
  .refine((v) => Number.isFinite(v), { message: 'Debe ser número válido' });

export const createOfferInputSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    store: z.string().trim().min(1).max(200),
    hasDiscount: z.boolean().optional().default(true),
    price: numberLike.optional(),
    original_price: numberLike.optional(),
    image_url: optionalNullableString,
    image_urls: z.array(z.string().trim().min(1).max(2048)).max(8).optional().default([]),
    msi_months: z
      .union([z.number().int(), z.null(), z.undefined()])
      .transform((v) => (typeof v === 'number' ? v : null))
      .refine((v) => v == null || (v >= 1 && v <= 24), { message: 'MSI fuera de rango' }),
    offer_url: optionalTrimmedString,
    description: optionalTrimmedString,
    steps: optionalTrimmedString,
    conditions: optionalTrimmedString,
    coupons: optionalTrimmedString,
    category: optionalNullableString,
    bank_coupon: optionalNullableString,
    tags: z.array(z.string().trim().min(1).max(80)).max(20).optional().default([]),
    moderator_comment: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    const hasDiscount = data.hasDiscount !== false;
    const hasPrice = typeof data.price === 'number' && Number.isFinite(data.price);
    const hasOriginal = typeof data.original_price === 'number' && Number.isFinite(data.original_price);

    if (hasDiscount && !hasPrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'El precio es obligatorio cuando hay descuento',
      });
    }

    if (hasPrice && data.price! < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'El precio no puede ser negativo',
      });
    }

    if (hasOriginal && data.original_price! < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['original_price'],
        message: 'El precio original no puede ser negativo',
      });
    }
  });

export type CreateOfferInput = z.infer<typeof createOfferInputSchema>;
