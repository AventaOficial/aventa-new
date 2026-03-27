import { z } from 'zod';

export const voteInputSchema = z.object({
  offerId: z.string().uuid(),
  value: z.union([z.literal(2), z.literal(-1)]),
});

export type VoteInput = z.infer<typeof voteInputSchema>;
