'use client';

import type { OwnerCommandPayload } from '@/lib/owner/buildOwnerCommand';
import type { ActorMix, HumanContribution, SupplyHealthLevel, SupplyVolume } from '@/lib/owner/supplyIntelligence';
import type { SourceState } from '../types';
import { Card, CardHeader, NA } from './kit';
import { PackageSearch } from 'lucide-react';

function pct(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${Math.round(value * 100)}%`;
}

function num(value: number | null | undefined): string {
  if (value == null) return '—';
  return value.toLocaleString('es-MX');
}

function VolumeCells({ volume }: { volume: SupplyVolume | null }) {
  return (
    <>
      <td className="px-2 py-1 text-right tabular-nums">{num(volume?.created)}</td>
      <td className="px-2 py-1 text-right tabular-nums">{num(volume?.approved)}</td>
      <td className="px-2 py-1 text-right tabular-nums">{num(volume?.rejected)}</td>
    </>
  );
}

function MixLine({ mix }: { mix: ActorMix | null }) {
  if (!mix) return <NA why="Sin directorio de actores la mezcla no se publica." />;
  return (
    <span className="tabular-nums text-white/80">
      Humano {mix.human} · Cazador {mix.machineHunter} · Sistema {mix.system} · Sin atribución {mix.unattributed}
    </span>
  );
}

function HumanLine({ humans }: { humans: HumanContribution | null }) {
  if (!humans) return <NA why="Sin directorio de actores no hay contribución humana." />;
  if (humans.status === 'INSUFFICIENT_DATA') {
    return (
      <span>
        INSUFFICIENT_DATA · cobertura {pct(humans.coverage)} · humanos clasificados {num(humans.uniqueHumans)}
      </span>
    );
  }
  return (
    <span className="tabular-nums text-white/80">
      {num(humans.uniqueHumans)} humanos · principal {pct(humans.topHumanPct)} · top 3 {pct(humans.top3HumanPct)} · top 10{' '}
      {pct(humans.top10HumanPct)}
    </span>
  );
}

const HEALTH_CLASS: Record<SupplyHealthLevel, string> = {
  HEALTHY: 'text-emerald-300',
  WARNING: 'text-amber-300',
  CRITICAL: 'text-red-300',
};

const HEALTH_LABEL: Record<SupplyHealthLevel, string> = {
  HEALTHY: 'estable',
  WARNING: 'en aviso',
  CRITICAL: 'crítica',
};

export default function SupplyIntelligenceCard({ source }: { source: SourceState<OwnerCommandPayload> }) {
  const supply = source.data?.supply ?? null;
  return (
    <Card labelledBy="ceo-supply">
      <CardHeader id="ceo-supply" title="Oferta" icon={PackageSearch} iconStyle="plain" />
      {!supply ? (
        <p className="px-1 text-sm text-white/60">No se pudo leer la oferta.</p>
      ) : (
        <div className="space-y-3 px-1 text-sm text-white/75">
          <p className={HEALTH_CLASS[supply.health.level]}>Salud {HEALTH_LABEL[supply.health.level]}</p>
          <table className="w-full text-left text-[13px]">
            <thead className="text-white/45">
              <tr>
                <th className="px-2 py-1 font-medium">Ventana</th>
                <th className="px-2 py-1 text-right font-medium">Creadas</th>
                <th className="px-2 py-1 text-right font-medium">Aprobadas</th>
                <th className="px-2 py-1 text-right font-medium">Rechazadas</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className="px-2 py-1 font-medium text-white/80">Hoy</th>
                <VolumeCells volume={supply.volume.today} />
              </tr>
              <tr>
                <th className="px-2 py-1 font-medium text-white/80">7 días</th>
                <VolumeCells volume={supply.volume.d7} />
              </tr>
              <tr>
                <th className="px-2 py-1 font-medium text-white/80">30 días</th>
                <VolumeCells volume={supply.volume.d30} />
              </tr>
            </tbody>
          </table>
          <p>Pendientes ahora: {num(supply.pendingNow)}. Es el estado actual, no lo creado hoy.</p>
          <p>
            Actores a 30 días: <MixLine mix={supply.actorMix.d30} />
          </p>
          <p>
            Contribución humana: <HumanLine humans={supply.humans} />
          </p>
          <p className="tabular-nums">
            Cobertura de autor {pct(supply.humans?.coverage)} · atribuidas {num(supply.humans?.attributed)} · sin atribución{' '}
            {num(supply.humans?.unattributed)}
          </p>
          <p>
            Tiendas, de lo creado en 30 días y por estado actual:{' '}
            {supply.retailers?.slice(0, 3).map((row) => `${row.key} ${row.approved} aprobadas`).join(' · ') || 'sin datos'}
          </p>
          <p>
            Categorías, de lo creado en 30 días y por estado actual:{' '}
            {supply.categories?.slice(0, 3).map((row) => `${row.key} ${row.approved} aprobadas`).join(' · ') || 'sin datos'}
            {supply.missingCategory
              ? ` · sin categoría ${supply.missingCategory.created} creadas, ${supply.missingCategory.approved} aprobadas`
              : ''}
          </p>
          {supply.source ? (
            <p>
              Carril de observabilidad: comunidad {supply.source.community}, máquina {supply.source.machine}, incompleto{' '}
              {pct(supply.source.incompleteShare)}. No es la clase de actor.
            </p>
          ) : null}
          {supply.health.conditions.length > 0 ? (
            <ul className="list-disc space-y-1 pl-4 text-[13px] text-white/70">
              {supply.health.conditions.slice(0, 4).map((condition) => (
                <li key={condition.code}>{condition.detail}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Card>
  );
}
