import type { FxQuote } from './types';
import { CANONICAL_CURRENCY } from './types';

export type CurrencyRateRequest = {
  baseCurrency: string;
  quoteCurrency: typeof CANONICAL_CURRENCY;
  asOf: string;
};

/**
 * Contrato para una fuente de tipo de cambio.
 * Esta capa no elige proveedor ni inventa una cotización.
 * Una cotización ausente deja el precio sin normalizar.
 */
export interface CurrencyRateProvider {
  getRate(request: CurrencyRateRequest): Promise<FxQuote | null>;
}

export class UnavailableCurrencyRateProvider implements CurrencyRateProvider {
  async getRate(): Promise<null> {
    return null;
  }
}
