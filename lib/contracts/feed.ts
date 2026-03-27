import { z } from 'zod';

export const feedHomeQuerySchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  type: z.union([z.literal('trending'), z.literal('recent')]).default('trending'),
  cursor: z.string().trim().min(1).nullable().default(null),
});

export const feedForYouQuerySchema = z.object({
  limit: z.number().int().min(1).max(24).default(12),
  store: z.string().trim().min(1).max(200).nullable().default(null),
  category: z.string().trim().min(1).max(80).nullable().default(null),
});

export type FeedHomeQuery = z.infer<typeof feedHomeQuerySchema>;
export type FeedForYouQuery = z.infer<typeof feedForYouQuerySchema>;
