import { NextResponse } from 'next/server';
import { runOwnerImport } from '@/lib/affiliate/conversionBridge/runOwnerImport';
import { createSupabaseEconomicPort } from '@/lib/affiliate/conversionBridge/supabasePort';
import { requireAffiliateImport } from '@/lib/server/requireAdmin';
import { enforceRateLimit, getClientIp } from '@/lib/server/rateLimit';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MAX_REPORT_CHARS = 1_000_000;

/**
 * Importa un reporte oficial de afiliados.
 * No es público. No acepta el proveedor de prueba. No crea payouts.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(`affiliate-import:${getClientIp(request)}`, { critical: true });
  if (!limited.success) {
    return NextResponse.json({ error: 'rate_limited', confirmedSales: null }, { status: limited.status ?? 429 });
  }

  const auth = await requireAffiliateImport(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error, confirmedSales: null }, { status: auth.status });
  }

  const body = await request.json().catch(() => null);
  const report = typeof body?.report === 'string' ? body.report : '';
  const provider = body?.provider ?? 'MERCADOLIBRE';
  if (provider !== 'MERCADOLIBRE') {
    return NextResponse.json(
      { error: 'unknown_provider', confirmedSales: null, coverage: 'DATA_INCOMPLETE' },
      { status: 400 },
    );
  }
  if (report.length > MAX_REPORT_CHARS) {
    return NextResponse.json(
      { error: 'report_too_large', confirmedSales: null, coverage: 'DATA_INCOMPLETE' },
      { status: 413 },
    );
  }

  let port;
  try {
    port = createSupabaseEconomicPort(createServerClient());
  } catch {
    port = undefined;
  }
  const result = await runOwnerImport({ report, port });
  return NextResponse.json(result.body, { status: result.httpStatus });
}
