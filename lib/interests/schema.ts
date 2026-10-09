import { z } from 'zod';
import { INTEREST_CADENCES, INTEREST_LIMITS } from '@/lib/interests/normalize';

const optionalText = z
  .string()
  .trim()
  .max(INTEREST_LIMITS.optionalMax)
  .optional()
  .nullable();

export const interestBodySchema = z.object({
  label: z.string().trim().min(INTEREST_LIMITS.labelMin).max(INTEREST_LIMITS.labelMax),
  brand: optionalText,
  model: optionalText,
  category: z.string().trim().max(40).optional().nullable(),
  aliases: z.array(z.string().trim().min(1).max(INTEREST_LIMITS.optionalMax)).max(INTEREST_LIMITS.aliasMax).optional(),
  cadence: z.enum(INTEREST_CADENCES).optional(),
  notify: z.boolean().optional(),
});

/** El cliente no elige el dueño. El servidor usa solo la sesión. */
export function bodyClaimsForeignUser(raw: unknown): boolean {
  return Boolean(raw && typeof raw === 'object' && !Array.isArray(raw) && 'user_id' in raw);
}

export const interestEventSchema = z.object({
  name: z.enum([
    'interest_section_opened',
    'interest_offer_shown',
    'interest_offer_clicked',
    'interest_discovery_clicked',
  ]),
  offerId: z.string().uuid().optional().nullable(),
});
