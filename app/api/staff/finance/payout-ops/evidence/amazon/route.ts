import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requirePayoutOps } from '@/lib/staff/requireFinanceStaff';
import {
  parseAmazonAssociatesReport,
  summarizeAmazonEvidence,
} from '@/lib/finance/evidence/amazonReport';
import { applyAmazonEvidence } from '@/lib/finance/evidence/applyAmazonEvidence';

export const dynamic = 'force-dynamic';

const MAX_CSV_CHARS = 2_000_000;

/**
 * Evidence Capture Amazon (V2).
 * Body: { csv: string, commit?: boolean, label?: string }
 * commit=false (default) → solo preview. commit=true → escribe conversions/commissions
 * (observación económica; no ledger, no rewards, no payouts).
 */
export async function POST(request: Request) {
  const auth = await requirePayoutOps(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const csv = typeof body?.csv === 'string' ? body.csv : '';
  const commit = body?.commit === true;
  const label = typeof body?.label === 'string' ? body.label.trim().slice(0, 120) : null;

  if (!csv.trim()) return NextResponse.json({ error: 'csv obligatorio' }, { status: 400 });
  if (csv.length > MAX_CSV_CHARS) {
    return NextResponse.json({ error: 'CSV demasiado grande (máx 2 MB)' }, { status: 413 });
  }

  const parsed = parseAmazonAssociatesReport(csv);
  if (parsed.error || !parsed.type) {
    return NextResponse.json(
      { error: parsed.error ?? 'Reporte no reconocido', headers: parsed.headers, warnings: parsed.warnings },
      { status: 422 },
    );
  }

  try {
    const supabase = createServerClient();
    const applied = await applyAmazonEvidence(supabase, parsed.type, parsed.rows, {
      dryRun: !commit,
      actorId: auth.user.id,
      reportLabel: label,
    });
    return NextResponse.json({
      ok: true,
      type: parsed.type,
      summary: summarizeAmazonEvidence(parsed.rows),
      skipped: parsed.skipped,
      warnings: parsed.warnings,
      preview: parsed.rows.slice(0, 25),
      applied,
    });
  } catch (e) {
    console.error('[payout-ops/evidence/amazon]', e);
    return NextResponse.json({ error: 'No se pudo procesar el reporte' }, { status: 500 });
  }
}
