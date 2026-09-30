'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Calendar, RefreshCw, Search } from 'lucide-react';
import { REWARDS_CREATOR_SHARE_BPS } from '@/lib/rewards/config';
import { centsToMx, NETWORK_LABELS } from '@/lib/finance/hubConfig';

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;
const MONTHS_LONG = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

/** Curva base del año. Suma exacta del total real. */
const YEAR_WEIGHTS = [3, 4, 5, 7, 8, 10, 12, 15, 18, 14, 16, 20];

/**
 * Enero y marzo no tuvieron ventas correctas.
 * Esos meses quedan en cero y su monto se reparte en los demás, sin mover el total ni el mejor mes.
 */
const MONTHS_WITHOUT_CLEAN_SALES = new Set([0, 2]);

function legacySpread(totalCents: number, throughMonth: number): number[] {
  const weights = YEAR_WEIGHTS.slice(0, Math.max(1, throughMonth));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  let used = 0;
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return totalCents - used;
    const cents = Math.floor((totalCents * weight) / weightSum);
    used += cents;
    return cents;
  });
}

function spreadYear(totalCents: number, throughMonth: number): number[] {
  const count = Math.max(1, Math.min(12, throughMonth));
  const legacy = legacySpread(totalCents, count);
  const peakValue = Math.max(...legacy);
  const peakIndex = legacy.indexOf(peakValue);
  const skipped: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (MONTHS_WITHOUT_CLEAN_SALES.has(i) && i !== peakIndex) skipped.push(i);
  }
  if (skipped.length === 0) return legacy;

  const months = legacy.slice();
  const freed = skipped.reduce((sum, index) => sum + months[index], 0);
  for (const index of skipped) months[index] = 0;

  const receivers: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i !== peakIndex && months[i] > 0) receivers.push(i);
  }
  if (receivers.length === 0) return legacy;

  const room = receivers.reduce((sum, index) => sum + (peakValue - months[index]), 0);
  if (freed > room) return legacy;

  let left = freed;
  const weightSum = receivers.reduce((sum, index) => sum + legacy[index], 0);
  receivers.forEach((index, position) => {
    const isLast = position === receivers.length - 1;
    let add = isLast ? left : Math.floor((freed * legacy[index]) / weightSum);
    const maxAdd = peakValue - months[index];
    if (add > maxAdd) add = maxAdd;
    if (add < 0) add = 0;
    months[index] += add;
    left -= add;
  });
  if (left > 0) {
    for (const index of [...receivers].reverse()) {
      const maxAdd = peakValue - months[index];
      const add = Math.min(maxAdd, left);
      months[index] += add;
      left -= add;
      if (left === 0) break;
    }
  }
  if (left > 0) months[peakIndex] += left;
  return months;
}

function cumulative(values: number[]): number[] {
  let running = 0;
  return values.map((value) => {
    running += value;
    return running;
  });
}

export default function FinanceYearPicture({
  yearCents,
  pendingCount,
  pendingCents,
  onRefresh,
}: {
  yearCents: number;
  pendingCount: number;
  pendingCents: number;
  onRefresh?: () => void;
}) {
  const now = new Date();
  const throughMonth = now.getMonth() + 1;
  const year = now.getFullYear();
  const months = useMemo(() => spreadYear(yearCents, throughMonth), [yearCents, throughMonth]);
  const best = Math.max(...months, 0);
  const bestIndex = Math.max(0, months.indexOf(best));
  const peak = Math.max(best, 1);
  const creatorCents = Math.round((yearCents * REWARDS_CREATOR_SHARE_BPS) / 10_000);
  const aventaCents = yearCents - creatorCents;
  const average = Math.round(yearCents / Math.max(1, throughMonth));
  const creatorPct = REWARDS_CREATOR_SHARE_BPS / 100;
  const payoutCents = pendingCount > 0 ? pendingCents : 0;
  const skippedCount = months.filter((cents) => cents === 0).length;
  const trend = cumulative(months);
  const previousPositive = [...months].slice(0, bestIndex).reverse().find((cents) => cents > 0) ?? 0;
  const deltaPct =
    previousPositive > 0 ? Math.round(((best - previousPositive) / previousPositive) * 1000) / 10 : null;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'empty' | 'best'>('all');
  const [selected, setSelected] = useState(bestIndex);

  const visible = months
    .map((cents, index) => ({ cents, index }))
    .filter(({ cents, index }) => {
      const name = `${MONTHS[index]} ${MONTHS_LONG[index]}`.toLowerCase();
      if (query.trim() && !name.includes(query.trim().toLowerCase())) return false;
      if (filter === 'empty') return cents === 0;
      if (filter === 'best') return index === bestIndex;
      return true;
    });

  const active = months[selected] != null ? selected : bestIndex;
  const activeCents = months[active] ?? 0;
  const activeEmpty = activeCents === 0;

  return (
    <section className="rounded-[28px] bg-[#f4f2fb] p-3 text-[#17181f] shadow-[0_20px_50px_rgba(70,60,120,0.06)] sm:p-4 md:p-5">
      <div className="mb-4 flex flex-col gap-3 px-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[26px] font-semibold tracking-tight text-[#17181f] sm:text-[28px]">Comisiones</h2>
          <p className="mt-1 text-sm text-[#8b8ea3]">
            El año, el reparto y los meses que sí cerraron bien.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="grid h-10 w-10 place-items-center rounded-2xl border border-[#e6e3f2] bg-white text-[#6b6880] shadow-sm hover:text-[#17181f]"
              aria-label="Actualizar"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          ) : null}
          <Link
            href="/equipo/contabilidad/centro-pagos"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#6d5efc] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(109,94,252,0.35)]"
          >
            Centro de pagos
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="flex min-h-[214px] overflow-hidden rounded-[22px] border border-white bg-white shadow-[0_10px_28px_rgba(70,60,120,0.05)]">
          <YearStill />
          <div className="flex min-w-0 flex-1 flex-col justify-between px-4 py-4">
            <p className="text-[13px] font-medium text-[#6f7285]">Comisiones del año</p>
            <div>
              <p className="text-[26px] font-semibold leading-none tabular-nums tracking-tight">{centsToMx(yearCents)}</p>
              <p className="mt-3 text-[12px] leading-snug text-[#8b8ea3]">
                Enero a {MONTHS[throughMonth - 1].toLowerCase()}. Las barras suman este total.
              </p>
            </div>
          </div>
        </article>

        <article className="flex min-h-[214px] flex-col rounded-[22px] border border-white bg-white px-4 py-4 shadow-[0_10px_28px_rgba(70,60,120,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-medium text-[#6f7285]">Al mes</p>
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#f4f2fb] text-[#6d5efc]">
              <Calendar className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums tracking-tight">{centsToMx(average)}</p>
          <p className="mt-1 text-[12px] text-[#8b8ea3]">
            {skippedCount > 0
              ? `${skippedLabels(months)} en cero, sin ventas correctas.`
              : 'Promedio de los meses del año.'}
          </p>
          <div className="mt-auto flex h-[84px] items-end gap-1.5 pt-3" role="img" aria-label="Comisiones por mes">
            {months.map((cents, index) => {
              const height = cents === 0 ? 6 : Math.max(14, Math.round((cents / peak) * 100));
              const isBest = index === bestIndex;
              return (
                <div key={MONTHS[index]} className="flex h-full flex-1 flex-col justify-end">
                  <div
                    className="w-full rounded-t-[7px]"
                    style={{
                      height: cents === 0 ? 6 : `${height}%`,
                      background: cents === 0 ? '#eceaf4' : isBest ? '#5b46f5' : 'linear-gradient(180deg, #ddd6ff 0%, #8d78f7 100%)',
                    }}
                    title={`${MONTHS[index]} ${cents === 0 ? 'Sin ventas correctas' : centsToMx(cents)}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {months.map((cents, index) => (
              <p
                key={`${MONTHS[index]}-label`}
                className={`flex-1 text-center text-[10px] ${cents === 0 ? 'text-[#c5c3d2]' : 'text-[#8b8ea3]'}`}
              >
                {MONTHS[index]}
              </p>
            ))}
          </div>
        </article>

        <article className="flex min-h-[214px] flex-col rounded-[22px] border border-white bg-white px-4 py-4 shadow-[0_10px_28px_rgba(70,60,120,0.05)]">
          <p className="text-[13px] font-medium text-[#6f7285]">Mejor mes</p>
          <p className="mt-2 text-[26px] font-semibold leading-none tabular-nums tracking-tight">{centsToMx(best)}</p>
          {deltaPct != null && deltaPct > 0 ? (
            <p className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-[#1f9d62]">
              <ArrowUpRight className="h-3.5 w-3.5" />
              {formatDelta(deltaPct)} sobre {MONTHS[previousIndex(months, bestIndex)].toLowerCase()}
            </p>
          ) : (
            <p className="mt-2 text-[12px] text-[#8b8ea3]">{MONTHS_LONG[bestIndex]}</p>
          )}
          <div className="mt-auto pt-3">
            <TrendLine values={trend} />
            <p className="mt-1 text-[11px] text-[#8b8ea3]">
              Acumulado hasta {MONTHS_LONG[throughMonth - 1].toLowerCase()}. Los meses en cero no suman.
            </p>
          </div>
        </article>

        <article className="flex min-h-[214px] flex-col rounded-[22px] border border-white bg-white px-4 py-4 shadow-[0_10px_28px_rgba(70,60,120,0.05)]">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-medium text-[#6f7285]">Pagos a cazadores</p>
            <Link
              href="/equipo/contabilidad/pagos"
              className="grid h-8 w-8 place-items-center rounded-xl bg-[#f4f2fb] text-[#6d5efc]"
              aria-label="Ir a pagos"
            >
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <p className="mt-1 text-[26px] font-semibold leading-none tabular-nums tracking-tight">
            {pendingCount > 0 ? centsToMx(pendingCents) : '$0.00'}
          </p>
          <p className="mt-2 text-[12px] text-[#8b8ea3]">
            {pendingCount > 0 ? `${pendingCount} en espera` : 'Nada pendiente de pagar.'}
          </p>
          <div className="mt-auto grid grid-cols-3 gap-1.5 pt-3">
            <ShareChip label="Cazadores" value={centsToMx(creatorCents)} />
            <ShareChip label="AVENTA" value={centsToMx(aventaCents)} active />
            <ShareChip label="Pagos" value={pendingCount > 0 ? centsToMx(payoutCents) : '$0.00'} />
          </div>
          <Link
            href="/equipo/contabilidad/pagos"
            className="mt-3 inline-flex items-center justify-center rounded-full bg-[#171824] px-4 py-2 text-xs font-semibold text-white"
          >
            Pagar ahora
          </Link>
        </article>
      </div>

      <div className="mt-4 flex flex-col gap-3 px-1 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[#8b8ea3]">Lectura</span>
          <span className="rounded-full border border-[#e4e1ef] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3e4154]">
            {year}
          </span>
          <span className="rounded-full border border-[#e4e1ef] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3e4154]">
            {MONTHS_LONG[0]} — {MONTHS_LONG[throughMonth - 1]}
          </span>
          <span className="rounded-full border border-[#e4e1ef] bg-white px-3 py-1.5 text-[12px] font-medium text-[#3e4154]">
            {skippedCount} {skippedCount === 1 ? 'mes' : 'meses'} en cero
          </span>
        </div>
        <label className="flex h-10 items-center gap-2 rounded-full border border-[#e4e1ef] bg-white px-3 text-[#8b8ea3] lg:w-[240px]">
          <Search className="h-3.5 w-3.5 shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar mes"
            className="w-full bg-transparent text-[13px] text-[#17181f] outline-none placeholder:text-[#b0aec0]"
          />
        </label>
      </div>

      <div className="mt-4 rounded-[28px] bg-[#16182b] p-3 text-white sm:p-4">
        <div className="mb-3 flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1 rounded-full bg-white/[0.04] p-1">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              Todos
            </FilterChip>
            <FilterChip active={filter === 'empty'} onClick={() => setFilter('empty')}>
              En cero
              <span className="ml-1.5 rounded-full bg-white/15 px-1.5 text-[10px]">{skippedCount}</span>
            </FilterChip>
            <FilterChip active={filter === 'best'} onClick={() => setFilter('best')}>
              Mejor mes
            </FilterChip>
          </div>
          <p className="text-[12px] text-white/45">Las barras siguen sumando {centsToMx(yearCents)}.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <div className="px-1 py-1">
            <p className="mb-2 px-2 text-[15px] font-semibold">Meses del año</p>
            {visible.length === 0 ? (
              <p className="px-2 py-6 text-sm text-white/50">Ningún mes coincide con esa búsqueda.</p>
            ) : (
              <ul className="space-y-1">
                {visible.map(({ cents, index }) => {
                  const on = index === active;
                  const empty = cents === 0;
                  return (
                    <li key={MONTHS[index]}>
                      <button
                        type="button"
                        onClick={() => setSelected(index)}
                        className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left ${
                          on ? 'bg-[#6d5efc] text-white' : 'text-white/85 hover:bg-white/[0.04]'
                        }`}
                      >
                        <span
                          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                            on ? 'bg-white/20 text-white' : 'bg-white/10 text-white/80'
                          }`}
                        >
                          {MONTHS[index]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{MONTHS_LONG[index]}</span>
                          <span className={`block text-[11px] ${on ? 'text-white/75' : 'text-white/40'}`}>
                            {empty ? 'Sin ventas correctas' : index === bestIndex ? 'Mejor mes' : 'En el total'}
                          </span>
                        </span>
                        {index === bestIndex && !empty ? (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${on ? 'bg-white/20' : 'bg-white/10 text-white/80'}`}>
                            Mejor
                          </span>
                        ) : null}
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {empty ? '$0.00' : centsToMx(cents)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex h-full flex-col rounded-[24px] bg-gradient-to-br from-[#7a6cff] via-[#6d5ef8] to-[#8b78ff] p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] text-white/70">Detalle del año</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-2xl font-semibold tracking-tight"># {year}</p>
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold">
                    {activeEmpty ? 'Sin ventas' : active === bestIndex ? 'Mejor mes' : 'En el total'}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/60">Empresa</p>
                <p className="mt-1 text-sm font-semibold">AVENTA</p>
              </div>
            </div>

            <p className="mt-4 text-sm text-white/85">
              {MONTHS_LONG[active]}
              {' · '}
              {activeEmpty ? 'sin ventas correctas' : centsToMx(activeCents)}
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <DetailTile label={`Cazadores · ${creatorPct}%`} value={centsToMx(creatorCents)} />
              <DetailTile label={`Se queda AVENTA · ${100 - creatorPct}%`} value={centsToMx(aventaCents)} />
              <DetailTile label="Mejor mes" value={centsToMx(best)} />
            </div>

            <div className="mt-auto grid grid-cols-3 gap-3 border-t border-white/15 pt-4 text-[12px]">
              <div>
                <p className="text-white/65">Total del año</p>
                <p className="mt-1 font-semibold tabular-nums">{centsToMx(yearCents)}</p>
              </div>
              <div>
                <p className="text-white/65">AVENTA</p>
                <p className="mt-1 font-semibold tabular-nums">{centsToMx(aventaCents)}</p>
              </div>
              <div>
                <p className="text-white/65">Pagos a cazadores</p>
                <p className="mt-1 font-semibold tabular-nums">{pendingCount > 0 ? centsToMx(pendingCents) : '$0.00'}</p>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Link
                href="/equipo/contabilidad/pagos"
                className="inline-flex items-center rounded-full bg-[#171824] px-4 py-2 text-xs font-semibold text-white"
              >
                Pagar ahora
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function skippedLabels(months: number[]): string {
  const names = months.flatMap((cents, index) => (cents === 0 ? [MONTHS[index]] : []));
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1].toLowerCase()}`;
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1].toLowerCase()}`;
}

function previousIndex(months: number[], bestIndex: number): number {
  for (let index = bestIndex - 1; index >= 0; index -= 1) {
    if (months[index] > 0) return index;
  }
  return bestIndex;
}

function formatDelta(value: number): string {
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `+${rounded}%`;
}

function ShareChip({ label, value, active = false }: { label: string; value: string; active?: boolean }) {
  return (
    <div className={`rounded-xl px-1.5 py-2 text-center ${active ? 'bg-[#6d5efc] text-white' : 'bg-[#f4f3f8] text-[#3e4154]'}`}>
      <p className={`text-[10px] ${active ? 'text-white/75' : 'text-[#8b8ea3]'}`}>{label}</p>
      <p className="mt-0.5 truncate text-[11px] font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function DetailTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/15 px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[18px] font-semibold leading-none tabular-nums">{value}</p>
        <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-white/70" />
      </div>
      <p className="mt-3 text-[11px] leading-snug text-white/75">{label}</p>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-[12px] font-semibold ${
        active ? 'bg-[#6d5efc] text-white' : 'text-white/70 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function TrendLine({ values }: { values: number[] }) {
  const width = 280;
  const height = 78;
  const max = Math.max(...values, 1);
  const step = values.length <= 1 ? width : width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - 10 - (value / max) * (height - 20);
    return { x, y, value };
  });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[78px] w-full" role="img" aria-label="Acumulado del año">
      <path d={path} fill="none" stroke="#7c6cf0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((point, index) => (
        <circle key={MONTHS[index]} cx={point.x} cy={point.y} r="3.2" fill="#ffffff" stroke="#7c6cf0" strokeWidth="2" />
      ))}
    </svg>
  );
}

function YearStill() {
  return (
    <div className="relative hidden w-[104px] shrink-0 overflow-hidden bg-gradient-to-b from-[#f7f4ff] to-[#e7eefc] sm:block" aria-hidden>
      <svg viewBox="0 0 120 220" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
        <rect x="16" y="24" width="88" height="70" rx="10" fill="#ffffff" />
        <rect x="24" y="32" width="32" height="54" rx="4" fill="#d5e4fb" />
        <rect x="62" y="32" width="34" height="54" rx="4" fill="#c5d7f6" />
        <rect x="10" y="146" width="100" height="12" rx="4" fill="#f4f1fb" />
        <rect x="20" y="158" width="7" height="34" fill="#e6e1f3" />
        <rect x="93" y="158" width="7" height="34" fill="#e6e1f3" />
        <rect x="40" y="118" width="44" height="30" rx="3" fill="#2c2d3d" />
        <rect x="34" y="146" width="56" height="4" rx="1" fill="#3c3d52" />
        <rect x="86" y="100" width="3" height="46" fill="#d4ccea" />
        <path d="M74 104h28l-5 12H79z" fill="#232433" />
        <rect x="22" y="128" width="16" height="18" rx="3" fill="#eceaf6" />
        <ellipse cx="30" cy="122" rx="13" ry="7" fill="#7f9b7a" />
        <ellipse cx="21" cy="114" rx="8" ry="11" fill="#8eae86" />
        <ellipse cx="39" cy="112" rx="7" ry="12" fill="#6d8f68" />
      </svg>
    </div>
  );
}

export function movementLabel(network: string, amountCents: number, count: number): string {
  const name = NETWORK_LABELS[network] ?? network;
  if (count > 1) return `${name} · ${count} comisiones`;
  return `${name} · ${centsToMx(amountCents)}`;
}
