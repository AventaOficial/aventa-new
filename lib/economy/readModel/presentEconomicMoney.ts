import type { MoneyState } from '@/lib/economy/readModel/loadEconomicSnapshot';

export type EconomicKind = 'realized' | 'liability' | 'payout' | 'estimated' | 'legacy' | 'not_implemented' | 'no_data';

export function presentEconomicMoney(figure: MoneyState): string {
  if (figure.state === 'amount') {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(
      figure.cents / 100,
    );
  }
  if (figure.state === 'none') return 'Sin registro';
  if (figure.state === 'not_implemented') return 'No implementado';
  return 'Sin datos';
}

export function economicKindLabel(kind: EconomicKind): string {
  switch (kind) {
    case 'realized':
      return 'Realizado';
    case 'liability':
      return 'Obligación';
    case 'payout':
      return 'Pago';
    case 'estimated':
      return 'Estimado';
    case 'legacy':
      return 'Legado';
    case 'not_implemented':
      return 'No implementado';
    case 'no_data':
      return 'Sin datos';
  }
}
