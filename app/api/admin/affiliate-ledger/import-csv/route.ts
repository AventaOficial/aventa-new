import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import {
  AFFILIATE_LEDGER_NETWORKS,
  type AffiliateLedgerNetwork,
} from '@/lib/commissions/affiliateLedger';
import { parseAffiliateLedgerCsv } from '@/lib/commissions/parseAffiliateLedgerCsv';

function isNetwork(v: unknown): v is AffiliateLedgerNetwork {
  return typeof v === 'string' && (AFFILIATE_LEDGER_NETWORKS as readonly string[]).includes(v);
}

/**
 * Importa CSV de reportes afiliados al ledger.
 * Body JSON: { csv: string, network?: string, currency?: string, status?: 'accrued'|'paid' }
 * Resuelve creator_id por ml_tracking_tag o amazon_tracking_tag.
 */
export async function POST(request: Request) {
  const auth = await requireUsersLogs(request);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const csv = typeof body?.csv === 'string' ? body.csv : '';
  const networkDefault = isNetwork(body?.network) ? body.network : 'other';
  const currencyDefault =
    typeof body?.currency === 'string' && body.currency.trim().length === 3
      ? body.currency.trim().toUpperCase()
      : 'MXN';
  const status =
    body?.status === 'paid' || body?.status === 'accrued' || body?.status === 'pending'
      ? body.status
      : 'accrued';

  const parsed = parseAffiliateLedgerCsv(csv, {
    network: networkDefault,
    currency: currencyDefault,
  });
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: 'No hay filas válidas para importar', skipped: parsed.skipped },
      { status: 400 },
    );
  }

  const supabase = createServerClient();

  const tags = [
    ...new Set(
      parsed.rows
        .map((r) => r.tracking_tag?.trim().toLowerCase())
        .filter((t): t is string => Boolean(t)),
    ),
  ];

  const tagToUser = new Map<string, string>();
  if (tags.length > 0) {
    const { data: allTagged } = await supabase
      .from('profiles')
      .select('id, ml_tracking_tag, amazon_tracking_tag')
      .or('ml_tracking_tag.not.is.null,amazon_tracking_tag.not.is.null');

    for (const p of allTagged ?? []) {
      const id = (p as { id: string }).id;
      const ml = String((p as { ml_tracking_tag?: string | null }).ml_tracking_tag ?? '')
        .trim()
        .toLowerCase();
      const amz = String((p as { amazon_tracking_tag?: string | null }).amazon_tracking_tag ?? '')
        .trim()
        .toLowerCase();
      if (ml) tagToUser.set(ml, id);
      if (amz) tagToUser.set(amz, id);
    }
  }

  const payloads = parsed.rows.map((r) => {
    const tag = r.tracking_tag?.trim() || null;
    const creatorId = tag ? tagToUser.get(tag.toLowerCase()) ?? null : null;
    return {
      network: r.network ?? networkDefault,
      amount_cents: r.amount_cents,
      currency: r.currency || currencyDefault,
      status,
      external_ref: r.external_ref,
      notes: r.notes ?? null,
      source: 'csv_import' as const,
      tracking_tag: tag,
      creator_id: creatorId,
      attributable: Boolean(creatorId || tag),
      meta: { imported_by: auth.user.id },
    };
  });

  let inserted = 0;
  let duplicates = 0;
  let failed = 0;
  const errors: string[] = [];

  // Insertar en lotes pequeños
  const chunkSize = 25;
  for (let i = 0; i < payloads.length; i += chunkSize) {
    const chunk = payloads.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('affiliate_ledger_entries')
      .insert(chunk)
      .select('id');

    if (error) {
      if (
        (error.message ?? '').includes('creator_id') ||
        (error.message ?? '').includes('attributable') ||
        error.code === 'PGRST204'
      ) {
        return NextResponse.json(
          {
            error:
              'Falta migración de atribución. Ejecuta docs/supabase-migrations/commissions_attributed_revenue.sql',
          },
          { status: 503 },
        );
      }
      // Reintento fila a fila ante unique violations
      for (const row of chunk) {
        const one = await supabase.from('affiliate_ledger_entries').insert(row).select('id').single();
        if (one.error) {
          if (one.error.code === '23505') duplicates++;
          else {
            failed++;
            if (errors.length < 5) errors.push(one.error.message);
          }
        } else {
          inserted++;
        }
      }
    } else {
      inserted += data?.length ?? chunk.length;
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    duplicates,
    failed,
    skipped_parse: parsed.skipped,
    resolved_tags: tagToUser.size,
    errors: errors.length ? errors : undefined,
  });
}
