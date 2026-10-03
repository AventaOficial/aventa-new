'use client';

import { Tag } from 'lucide-react';
import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import { Bar, CtaLink, Panel, ProvenanceBadge, SourceGate, formatCount } from './ui';
import type { SourceState } from './types';

export default function CatalogHealth({ command, onRetry }: { command: SourceState<OwnerCommandPayload>; onRetry: () => void }) {
  return (
    <Panel
      id="catalogo"
      title="Salud del catálogo"
      icon={Tag}
      subtitle="Estado actual de ofertas (no depende del período)."
      badge={<ProvenanceBadge kind={command.data ? 'REAL' : 'UNKNOWN'} hint="offers.status / expires_at / deleted_at" />}
      action={<CtaLink href="/admin/moderation">Moderar</CtaLink>}
    >
      <SourceGate source={command} onRetry={onRetry} rows={4} label="catálogo">
        {(cmd) => {
          const { live, pending, expired, rejected } = cmd.catalog;
          const rows = [
            { label: 'Live', value: live, tone: 'green' as const, hint: 'approved/published sin expirar' },
            { label: 'Pendientes', value: pending, tone: 'amber' as const, hint: 'status = pending' },
            { label: 'Expiradas', value: expired, tone: 'violet' as const, hint: 'approved/published con expires_at pasado' },
            { label: 'Rechazadas', value: rejected, tone: 'red' as const, hint: 'status = rejected (no eliminadas)' },
          ];
          const total = rows.reduce((a, r) => a + (r.value ?? 0), 0);
          return (
            <ul className="space-y-3">
              {rows.map((r) => (
                <li key={r.label} title={r.hint}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-white/70">{r.label}</span>
                    <span className="tabular-nums text-white">
                      {r.value == null ? <span className="text-white/40">No disponible</span> : formatCount(r.value)}
                      {r.value != null && total > 0 ? <span className="ml-1.5 text-[10px] text-white/35">{Math.round((r.value / total) * 100)}%</span> : null}
                    </span>
                  </div>
                  <Bar value={r.value ?? 0} max={total} tone={r.value == null ? 'gray' : r.tone} />
                </li>
              ))}
            </ul>
          );
        }}
      </SourceGate>
    </Panel>
  );
}
