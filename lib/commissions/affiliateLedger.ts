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

export const affiliateLedgerInsertSchema = z.object({
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
});

export type AffiliateLedgerInsert = z.infer<typeof affiliateLedgerInsertSchema>;
