export type BankCouponOption = {
  value: string;
  label: string;
};

export const BANK_COUPON_OPTIONS: BankCouponOption[] = [
  { value: 'bbva', label: 'BBVA' },
  { value: 'banamex', label: 'Banamex' },
  { value: 'santander', label: 'Santander' },
  { value: 'hsbc', label: 'HSBC' },
  { value: 'banorte', label: 'Banorte' },
  { value: 'scotiabank', label: 'Scotiabank' },
  { value: 'inbursa', label: 'Inbursa' },
  { value: 'nu', label: 'Nu' },
  { value: 'rappi-card', label: 'RappiCard' },
  { value: 'otro', label: 'Otro banco' },
];

const BANK_COUPON_SET = new Set(BANK_COUPON_OPTIONS.map((b) => b.value));
const BANK_COUPON_LABEL_MAP = new Map(BANK_COUPON_OPTIONS.map((b) => [b.value, b.label]));

export function normalizeBankCoupon(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const lower = value.trim().toLowerCase();
  return BANK_COUPON_SET.has(lower) ? lower : null;
}

export function getBankCouponLabel(value: string | null | undefined): string | null {
  const normalized = normalizeBankCoupon(value);
  if (!normalized) return null;
  return BANK_COUPON_LABEL_MAP.get(normalized) ?? normalized;
}
