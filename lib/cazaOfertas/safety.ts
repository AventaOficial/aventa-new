/**
 * CazaOfertasss — FASE 0. Aserciones de frontera.
 *
 * La independencia de CazaOfertasss no puede depender de la disciplina de quien
 * escribe código. Estas funciones son invocadas por tests de contrato.
 */

import {
  CAZAOFERTAS_AVENTA_BOUNDARY,
  CAZAOFERTAS_LLM_AUTHORITY,
  CAZAOFERTAS_PUBLICATION_BOUNDARY,
  CAZAOFERTAS_SECRET_POLICY,
} from './constants';

export function assertAventaBoundaryIntact(): void {
  const b = CAZAOFERTAS_AVENTA_BOUNDARY;
  if (
    b.writesAventaLedger ||
    b.writesAventaRewards ||
    b.writesAventaPayoutIntents ||
    b.writesAventaCommissions ||
    b.readsAventaEconomicTables ||
    b.settlementEnabled ||
    b.sharesEconomicTables
  ) {
    throw new Error('CazaOfertasss: frontera con el money path de Aventa violada');
  }
  if (b.integrationStyle !== 'contracts_and_events_only') {
    throw new Error('CazaOfertasss: la integración con Aventa debe ser por contratos/eventos');
  }
}

/**
 * Garantía estructural (FASE 0/1): CazaOfertasss no escribe en el money path
 * de Aventa. Alias usado por la suite de persistencia.
 */
export function assertAventaMoneyPathUntouched(): void {
  assertAventaBoundaryIntact();
}

/** Alias FASE 1 explícito para la suite de persistencia. */
export function assertCazaOfertasMoneyUntouched(): void {
  assertAventaMoneyPathUntouched();
}

export function assertPublicationDisabled(): void {
  if (
    CAZAOFERTAS_PUBLICATION_BOUNDARY.telegramPublishEnabled ||
    CAZAOFERTAS_PUBLICATION_BOUNDARY.autoPublishEnabled
  ) {
    throw new Error('CazaOfertasss FASE 0: la publicación debe permanecer deshabilitada');
  }
}

export function assertLlmIsNotAuthority(): void {
  const a = CAZAOFERTAS_LLM_AUTHORITY;
  if (a.priceAuthority || a.discountAuthority || a.scoreAuthority) {
    throw new Error('CazaOfertasss: un LLM no puede ser autoridad de precio, descuento ni score');
  }
}

export function assertSecretPolicy(): void {
  const p = CAZAOFERTAS_SECRET_POLICY;
  if (p.storeSecretsInCode || p.exposeSecretsToClient) {
    throw new Error('CazaOfertasss: política de secretos violada');
  }
}

/**
 * Resuelve una credencial de afiliación por NOMBRE de variable de entorno.
 * Devuelve sólo presencia/ausencia: el valor nunca sale de esta función.
 */
export function affiliateCredentialIsConfigured(envVarName: string): boolean {
  if (!/^[A-Z][A-Z0-9_]{3,64}$/.test(envVarName)) return false;
  const value = process.env[envVarName];
  return typeof value === 'string' && value.trim().length > 0;
}
