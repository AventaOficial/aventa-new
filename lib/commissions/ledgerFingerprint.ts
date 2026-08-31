import { createHash } from 'crypto';

export type LedgerFingerprintInput = {
  network: string;
  amount_cents: number;
  currency: string;
  tracking_tag?: string | null;
  rawLine?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  notes?: string | null;
};

/** Huella estable para deduplicar imports sin external_ref de la red. */
export function fingerprintLedgerRow(input: LedgerFingerprintInput): string {
  const raw = [
    (input.network ?? '').trim().toLowerCase(),
    String(Math.floor(input.amount_cents)),
    (input.currency ?? 'MXN').trim().toUpperCase(),
    (input.tracking_tag ?? '').trim().toLowerCase(),
    (input.rawLine ?? '').trim(),
    (input.period_start ?? '').trim(),
    (input.period_end ?? '').trim(),
    (input.notes ?? '').trim(),
  ].join('|');
  return `fp:${createHash('sha256').update(raw).digest('hex').slice(0, 40)}`;
}
