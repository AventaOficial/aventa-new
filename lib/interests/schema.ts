import { z } from 'zod';
import { INTEREST_CADENCES, INTEREST_LIMITS } from '@/lib/interests/normalize';
import { DESPENSA_BUDGET_HORIZONS, DESPENSA_BUDGET_TIERS } from '@/lib/despensa/budget';

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

export const interestEventSchema = z.union([
  z.object({
    name: z.enum([
      'interest_section_opened',
      'interest_offer_shown',
      'interest_offer_clicked',
      'interest_discovery_clicked',
    ]),
    offerId: z.string().uuid().optional().nullable(),
  }),
  /** Presupuesto de despensa: solo horizonte y nivel. La cantidad nunca entra en analítica. */
  z
    .object({
      name: z.enum(['interest_saved', 'interest_removed']),
      kind: z.literal('despensa_budget'),
      horizon: z.enum(DESPENSA_BUDGET_HORIZONS).optional(),
      tier: z.enum(DESPENSA_BUDGET_TIERS).optional(),
      surface: z.enum(['dia_a_dia', 'me_intereses']),
    })
    .strict(),
]);
