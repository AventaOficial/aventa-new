import { z } from 'zod';

function queryStringOrNull(v: unknown): string | null {
  if (v == null || v === '') return null;
  const t = String(v).trim();
  return t.length === 0 ? null : t;
}

export const feedHomeQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  type: z.union([z.literal('trending'), z.literal('recent')]).default('trending'),
  cursor: z.string().trim().min(1).nullable().default(null),
  /** Si viene, el feed aplica el mismo pipeline que el home (periodo, categoría, tienda). */
  view: z.preprocess(
    queryStringOrNull,
    z.union([z.enum(['vitales', 'top', 'latest']), z.null()])
  ).default(null),
  period: z.enum(['day', 'week', 'month']).default('day'),
  category: z.preprocess(
    queryStringOrNull,
    z.union([z.string().min(1).max(80), z.null()])
  ).default(null),
  store: z.preprocess(
    queryStringOrNull,
    z.union([z.string().min(1).max(200), z.null()])
  ).default(null),
});

export const feedForYouQuerySchema = z.object({
  limit: z.number().int().min(1).max(24).default(12),
  store: z.string().trim().min(1).max(200).nullable().default(null),
  category: z.string().trim().min(1).max(80).nullable().default(null),
});

export type FeedHomeQuery = z.infer<typeof feedHomeQuerySchema>;
export type FeedForYouQuery = z.infer<typeof feedForYouQuerySchema>;
