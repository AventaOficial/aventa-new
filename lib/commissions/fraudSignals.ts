import type { CommissionFiscalProfile } from '@/lib/commissions/fiscal';
import { isFiscalProfileComplete } from '@/lib/commissions/fiscal';

export type CommissionFraudFlag =
  | 'missing_fiscal'
  | 'missing_clabe'
  | 'duplicate_rfc'
  | 'terms_not_accepted'
  | 'terms_outdated'
  | 'not_program_active';

export type CommissionPayoutReadiness = {
  ready: boolean;
  flags: CommissionFraudFlag[];
  labels: string[];
};

const FLAG_LABELS: Record<CommissionFraudFlag, string> = {
  missing_fiscal: 'Faltan nombre legal o RFC válido',
  missing_clabe: 'Sin CLABE (transferencia manual más lenta)',
  duplicate_rfc: 'RFC duplicado en otra cuenta',
  terms_not_accepted: 'No aceptó términos del programa',
  terms_outdated: 'Debe reaceptar la versión vigente de términos',
  not_program_active: 'Programa no activo públicamente',
};

export function evaluatePayoutReadiness(input: {
  fiscal: CommissionFiscalProfile;
  duplicateRfc: boolean;
  termsAccepted: boolean;
  /** Si se pasa, exige que coincida con la versión vigente */
  termsVersionCurrent?: boolean;
  programPubliclyActive: boolean;
  requireClabe?: boolean;
}): CommissionPayoutReadiness {
  const flags: CommissionFraudFlag[] = [];

  if (!input.termsAccepted) flags.push('terms_not_accepted');
  else if (input.termsVersionCurrent === false) flags.push('terms_outdated');
  if (!input.programPubliclyActive) flags.push('not_program_active');
  if (!isFiscalProfileComplete(input.fiscal)) flags.push('missing_fiscal');
  if (input.duplicateRfc) flags.push('duplicate_rfc');
  if (input.requireClabe && !input.fiscal.clabe) flags.push('missing_clabe');
  else if (!input.fiscal.clabe && isFiscalProfileComplete(input.fiscal)) {
    flags.push('missing_clabe');
  }

  const blocking = flags.filter(
    (f) =>
      f !== 'missing_clabe' &&
      f !== 'not_program_active',
  );

  return {
    ready: blocking.length === 0,
    flags,
    labels: flags.map((f) => FLAG_LABELS[f]),
  };
}

export function maskRfc(rfc: string | null): string {
  if (!rfc || rfc.length < 6) return '—';
  return `${rfc.slice(0, 4)}***${rfc.slice(-3)}`;
}

export function maskClabe(clabe: string | null): string {
  if (!clabe || clabe.length !== 18) return '—';
  return `****${clabe.slice(-4)}`;
}
