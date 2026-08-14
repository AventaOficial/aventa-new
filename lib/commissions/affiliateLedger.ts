import { z } from 'zod';

export const AFFILIATE_LEDGER_NETWORKS = [
  'amazon',
  'mercadolibre',
  'aliexpress',
  'temu',
  'walmart',
  'shein',
  'other',
] as const;

export type AffiliateLedgerNetwork = (typeof AFFILIATE_LEDGER_NETWORKS)[number];

export const affiliateLedgerInsertSchema = z
  .object({
    network: z.enum(AFFILIATE_LEDGER_NETWORKS),
    amount_cents: z.number().int(),
    currency: z.string().length(3).default('MXN'),
    period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    status: z.enum(['pending', 'accrued', 'paid', 'void']).default('pending'),
    external_ref: z.string().max(500).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    source: z.enum(['manual', 'csv_import', 'api']).default('manual'),
    meta: z.record(z.string(), z.unknown()).optional(),
    creator_id: z.string().uuid().optional().nullable(),
    tracking_tag: z.string().max(200).optional().nullable(),
    offer_id: z.string().uuid().optional().nullable(),
    /** Si se omite: true cuando hay creator_id o tracking_tag. */
    attributable: z.boolean().optional(),
  })
  .transform((row) => {
    const tracking = row.tracking_tag?.trim() || null;
    const creatorId = row.creator_id ?? null;
    const attributable =
      typeof row.attributable === 'boolean'
        ? row.attributable
        : Boolean(creatorId || tracking);
    return {
      ...row,
      tracking_tag: tracking,
      creator_id: creatorId,
      offer_id: row.offer_id ?? null,
      attributable,
    };
  });

export type AffiliateLedgerInsert = z.infer<typeof affiliateLedgerInsertSchema>;
