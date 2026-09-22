/**
 * Export contable (V6) — CSV para el contador externo. Puro.
 * CLABE enmascarada (últimos 4). RFC completo porque es dato fiscal necesario.
 */

import type { BatchPreview, PayeeProfileLite } from './types';

export function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function maskClabe(clabe: string | null): string {
  if (!clabe) return '';
  const d = clabe.replace(/\D/g, '');
  if (d.length < 4) return '****';
  return `**************${d.slice(-4)}`;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) lines.push(r.map(csvEscape).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export type PaidExportRow = {
  paidAt: string;
  creatorId: string;
  legalName: string | null;
  rfc: string | null;
  clabe: string | null;
  amountCents: number;
  currency: string;
  reference: string | null;
  source: 'payout_intent' | 'reward_payout';
  provider: string | null;
};

export function buildPaidExportCsv(rows: PaidExportRow[], periodKey: string): string {
  const headers = [
    'periodo',
    'fecha_pago',
    'creator_id',
    'nombre_legal',
    'rfc',
    'clabe_mascara',
    'monto_mxn',
    'monto_centavos',
    'moneda',
    'referencia',
    'origen',
    'proveedor',
  ];
  const body = rows
    .slice()
    .sort((a, b) => Date.parse(a.paidAt) - Date.parse(b.paidAt))
    .map((r) => [
      periodKey,
      r.paidAt,
      r.creatorId,
      r.legalName ?? '',
      r.rfc ?? '',
      maskClabe(r.clabe),
      (r.amountCents / 100).toFixed(2),
      r.amountCents,
      r.currency,
      r.reference ?? '',
      r.source,
      r.provider ?? '',
    ]);
  return toCsv(headers, body);
}

export function buildBatchExportCsv(
  batch: BatchPreview,
  profiles: Map<string, PayeeProfileLite>,
): string {
  const headers = [
    'periodo',
    'creator_id',
    'nombre',
    'nombre_legal',
    'rfc',
    'clabe_mascara',
    'monto_mxn',
    'monto_centavos',
    'recompensas',
    'decision',
    'codigos',
    'motivos',
  ];
  const body = batch.lines.map((l) => {
    const p = profiles.get(l.creatorId);
    return [
      batch.periodLabel,
      l.creatorId,
      l.displayName ?? '',
      p?.legalName ?? '',
      p?.rfc ?? '',
      maskClabe(p?.clabe ?? null),
      (l.amountCents / 100).toFixed(2),
      l.amountCents,
      l.rewardCount,
      l.gate.decision,
      l.gate.codes.join(';'),
      l.gate.reasons.join(' '),
    ];
  });
  return toCsv(headers, body);
}
