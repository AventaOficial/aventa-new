import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { requireUsersLogs } from '@/lib/server/requireAdmin';
import {
  AFFILIATE_LEDGER_NETWORKS,
  type AffiliateLedgerNetwork,
} from '@/lib/commissions/affiliateLedger';
import { parseAffiliateLedgerCsv, type AmountUnit } from '@/lib/commissions/parseAffiliateLedgerCsv';
import { fingerprintLedgerRow } from '@/lib/commissions/ledgerFingerprint';
import { decodeAventaSubId } from '@/lib/rewards/adapters/types';
import { appendEconomicEvent } from '@/lib/economy/appendEconomicEvent';
import {
  NETWORK_EVIDENCE_REWARDS_DISABLED,
  assertNetworkEvidenceExternalRefAllowed,
} from '@/lib/economy/ledger/canonicalLedgerAuthority';
import { isMoneyPathFrozen, moneyPathFrozenHttpBody } from '@/lib/server/moneyPathFreeze';

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

  // Network CSV is evidence ingest into the canonical ledger table — not a second SoT.
  // Never mints rewards from this path (rewards only via settlement→ledger bridge).
  if (isMoneyPathFrozen()) {
    return NextResponse.json(moneyPathFrozenHttpBody(), { status: 503 });
  }
  void NETWORK_EVIDENCE_REWARDS_DISABLED;

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
  const amountUnit: AmountUnit | undefined =
    body?.amount_unit === 'cents' || body?.amount_unit === 'major' ? body.amount_unit : undefined;
  const dedupeStrategy =
    body?.dedupe_strategy === 'fingerprint' ? 'fingerprint' : 'require_external_ref';

  const parsed = parseAffiliateLedgerCsv(csv, {
    network: networkDefault,
    currency: currencyDefault,
    amountUnit,
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

  const missingRef = parsed.rows.filter((r) => !r.external_ref?.trim()).length;
  if (missingRef > 0 && dedupeStrategy !== 'fingerprint') {
    return NextResponse.json(
      {
        error:
          'Hay filas sin external_ref. Vuelve a importar con dedupe_strategy=fingerprint o añade order_id/transaction al CSV.',
        missing_external_ref: missingRef,
      },
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
    const isAventaSubId = tag ? Boolean(decodeAventaSubId(tag)) : false;
    const creatorId = isAventaSubId ? null : tag ? tagToUser.get(tag.toLowerCase()) ?? null : null;
    const network = r.network ?? networkDefault;
    const currency = r.currency || currencyDefault;
    let externalRef = r.external_ref?.trim() || null;
    if (!externalRef && dedupeStrategy === 'fingerprint') {
      externalRef = fingerprintLedgerRow({
        network,
        amount_cents: r.amount_cents,
        currency,
        tracking_tag: tag,
        rawLine: r.raw_line,
        notes: r.notes ?? null,
      });
    }
    return {
      network,
      amount_cents: r.amount_cents,
      currency,
      status,
      external_ref: externalRef,
      notes: r.notes ?? null,
      source: 'csv_import' as const,
      tracking_tag: tag,
      creator_id: creatorId,
      attributable: isAventaSubId ? false : Boolean(creatorId || tag),
      meta: {
        imported_by: auth.user.id,
        dedupe_strategy: dedupeStrategy,
        evidence_ingest: true,
        rewards_created: false,
        ...(isAventaSubId && tag ? { sub_id: tag, ascsubtag: tag } : {}),
      },
    };
  });

  for (const row of payloads) {
    const guard = assertNetworkEvidenceExternalRefAllowed(row.external_ref);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: 400 });
    }
  }

  let inserted = 0;
  let duplicates = 0;
  let failed = 0;
  const errors: string[] = [];
  const insertedLedgerIds: string[] = [];

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
          if (one.data?.id) insertedLedgerIds.push((one.data as { id: string }).id);
        }
      }
    } else {
      inserted += data?.length ?? chunk.length;
      for (const row of data ?? []) {
        insertedLedgerIds.push((row as { id: string }).id);
      }
    }
  }

  for (const ledgerId of insertedLedgerIds) {
    const audit = await appendEconomicEvent(supabase, {
      entityType: 'settlement',
      entityId: ledgerId,
      eventType: 'network_report_evidence_ingested',
      toStatus: status,
      actor: `admin:${auth.user.id}`,
      payload: {
        source: 'csv_import',
        rewardsCreated: false,
        note: 'evidence_ingest_not_settlement_bridge',
      },
    });
    if (!audit.ok) {
      // Fail-closed: remove rows that lack complete audit trail.
      if (insertedLedgerIds.length > 0) {
        await supabase.from('affiliate_ledger_entries').delete().in('id', insertedLedgerIds);
      }
      return NextResponse.json(
        {
          error: 'audit_append_failed',
          detail: audit.error,
          inserted: 0,
          rolled_back: insertedLedgerIds.length,
          note: 'Ledger evidence rows rolled back because audit append failed',
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    inserted,
    duplicates,
    failed,
    rewards_created: 0,
    rewards_path: 'disabled_network_evidence_ingest',
    skipped_parse: parsed.skipped,
    resolved_tags: tagToUser.size,
    errors: errors.length ? errors : undefined,
  });
}
