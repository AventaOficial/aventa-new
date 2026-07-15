/** Validación y normalización de datos fiscales MX para pagos a cazadores. */

const RFC_PERSON_REGEX = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const CLABE_REGEX = /^\d{18}$/;

export type CommissionFiscalInput = {
  legal_name: string;
  rfc: string;
  clabe?: string | null;
};

export type CommissionFiscalProfile = {
  legalName: string | null;
  rfc: string | null;
  clabe: string | null;
  updatedAt: string | null;
};

export function normalizeRfc(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizeClabe(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 18 ? digits : digits || null;
}

export function normalizeLegalName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 200);
}

export function validateRfc(rfc: string): boolean {
  const n = normalizeRfc(rfc);
  if (n.length < 12 || n.length > 13) return false;
  return RFC_PERSON_REGEX.test(n);
}

/** Dígito verificador CLABE (Banxico). */
export function validateClabe(clabe: string): boolean {
  const digits = normalizeClabe(clabe);
  if (!digits || !CLABE_REGEX.test(digits)) return false;
  const weights = [3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7, 1, 3, 7];
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += Number(digits[i]) * weights[i];
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[17]);
}

export function validateCommissionFiscal(input: CommissionFiscalInput): {
  ok: boolean;
  error?: string;
  normalized?: { legal_name: string; rfc: string; clabe: string | null };
} {
  const legal_name = normalizeLegalName(input.legal_name ?? '');
  const rfc = normalizeRfc(input.rfc ?? '');
  const clabeRaw = input.clabe?.trim() ? input.clabe : null;
  const clabe = clabeRaw ? normalizeClabe(clabeRaw) : null;

  if (legal_name.length < 5) {
    return { ok: false, error: 'Escribe tu nombre legal completo (mínimo 5 caracteres).' };
  }
  if (!validateRfc(rfc)) {
    return { ok: false, error: 'RFC inválido. Usa el formato de 12 o 13 caracteres (sin espacios).' };
  }
  if (clabeRaw && (!clabe || !validateClabe(clabe))) {
    return { ok: false, error: 'CLABE inválida. Debe tener 18 dígitos y dígito verificador correcto.' };
  }

  return {
    ok: true,
    normalized: { legal_name, rfc, clabe },
  };
}

export function isFiscalProfileComplete(profile: CommissionFiscalProfile): boolean {
  return (
    !!profile.legalName &&
    profile.legalName.length >= 5 &&
    !!profile.rfc &&
    validateRfc(profile.rfc)
  );
}

export function fiscalProfileFromRow(row: {
  commission_legal_name?: string | null;
  commission_rfc?: string | null;
  commission_clabe?: string | null;
  commission_fiscal_updated_at?: string | null;
}): CommissionFiscalProfile {
  return {
    legalName: row.commission_legal_name?.trim() || null,
    rfc: row.commission_rfc ? normalizeRfc(row.commission_rfc) : null,
    clabe: row.commission_clabe ? normalizeClabe(row.commission_clabe) : null,
    updatedAt: row.commission_fiscal_updated_at ?? null,
  };
}
