'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ShoppingBasket, Trash2, Wallet } from 'lucide-react';
import { DespensaBudgetEditor } from '@/app/components/feed/DespensaBudgetCard';
import { useDespensaBudget } from '@/app/components/feed/useDespensaBudget';
import { useAuth } from '@/app/providers/AuthProvider';
import { describeDespensaBudget } from '@/lib/despensa/budget';
import { DESPENSA_BUDGET_COPY } from '@/lib/despensa/budgetCopy';
import {
  buildDespensaPlan,
  DESPENSA_AISLES,
  DESPENSA_LIST_LOCAL_KEY,
  DESPENSA_LIST_MAX_ITEMS,
  DESPENSA_PLAN_COPY,
  estimateDespensaList,
  formatMxnCents,
  parseDespensaList,
  type DespensaAisleId,
  type DespensaListItem,
  type DespensaOffer,
  type DespensaPick,
} from '@/lib/despensa/plan';
import { fetchDespensaPreferredNeeds } from '@/lib/offers/homeFeedClient';
import { buildOfferPublicPath } from '@/lib/offerPath';
import { DespensaNeedSection } from './DespensaNeedSection';

type LoadState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; offers: DespensaOffer[] };

const chip = (active: boolean) =>
  `shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? 'bg-[#1d1d1f] text-white dark:bg-[#fafafa] dark:text-[#1d1d1f]'
      : 'bg-[#e8e8ed] text-[#6e6e73] hover:bg-[#d2d2d7] dark:bg-[#2c2c2e] dark:text-[#a3a3a3] dark:hover:bg-[#3a3a3c]'
  }`;

function readList(): DespensaListItem[] {
  try {
    const raw = window.localStorage.getItem(DESPENSA_LIST_LOCAL_KEY);
    return raw ? parseDespensaList(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function writeList(items: DespensaListItem[]): void {
  try {
    if (items.length) window.localStorage.setItem(DESPENSA_LIST_LOCAL_KEY, JSON.stringify(items));
    else window.localStorage.removeItem(DESPENSA_LIST_LOCAL_KEY);
  } catch {
    /* almacenamiento bloqueado: la lista queda solo en esta visita */
  }
}

export default function DespensaView() {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const { budget, ready, saving, save } = useDespensaBudget('despensa');
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetError, setBudgetError] = useState(false);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [preferred, setPreferred] = useState<Set<string>>(() => new Set());
  const [aisle, setAisle] = useState<DespensaAisleId | 'all'>('all');
  const [list, setList] = useState<DespensaListItem[]>([]);
  const [now, setNow] = useState<Date | null>(null);

  const fetchOffers = useCallback(async () => {
    setLoad({ status: 'loading' });
    try {
      const res = await fetch('/api/despensa', { cache: 'no-store' });
      const body = (await res.json()) as { success?: boolean; offers?: DespensaOffer[] };
      if (!res.ok || !body.success || !Array.isArray(body.offers)) throw new Error('despensa');
      setNow(new Date());
      setLoad({ status: 'ready', offers: body.offers });
    } catch {
      setLoad({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    void fetchOffers();
    setList(readList());
  }, [fetchOffers]);

  useEffect(() => {
    let cancelled = false;
    void fetchDespensaPreferredNeeds(token).then((ids) => {
      if (!cancelled) setPreferred(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const plan = useMemo(() => {
    if (load.status !== 'ready' || !now) return null;
    return buildDespensaPlan(load.offers, { now, budget, preferredNeedIds: preferred });
  }, [load, now, budget, preferred]);

  const visibleNeeds = useMemo(
    () => (plan ? plan.needs.filter((n) => aisle === 'all' || n.aisle === aisle) : []),
    [plan, aisle],
  );
  const aislesWithOffers = useMemo(() => new Set(plan?.needs.map((n) => n.aisle) ?? []), [plan]);
  const visibleGaps = useMemo(
    () => (plan ? plan.referenceGaps.filter((g) => aisle === 'all' || g.aisle === aisle) : []),
    [plan, aisle],
  );

  const selected = useMemo(() => new Set(list.map((i) => i.id)), [list]);
  const estimate = estimateDespensaList(list, budget);
  const liveIds = useMemo(
    () => new Set(load.status === 'ready' ? load.offers.map((o) => o.id) : []),
    [load],
  );

  const toggle = useCallback((pick: DespensaPick) => {
    setList((prev) => {
      const next = prev.some((i) => i.id === pick.offer.id)
        ? prev.filter((i) => i.id !== pick.offer.id)
        : [
            ...prev,
            {
              id: pick.offer.id,
              title: pick.offer.title,
              price: pick.offer.discountPrice,
              needId: pick.needId,
              addedAt: new Date().toISOString(),
            },
          ].slice(-DESPENSA_LIST_MAX_ITEMS);
      writeList(next);
      return next;
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setList((prev) => {
      const next = prev.filter((i) => i.id !== id);
      writeList(next);
      return next;
    });
  }, []);

  async function saveBudget(next: Parameters<typeof save>[0]) {
    const ok = await save(next);
    setBudgetError(!ok);
    if (ok) setEditingBudget(false);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-6">
      <header>
        <h1 className="flex items-center gap-2 text-[24px] font-semibold text-[#1d1d1f] dark:text-[#fafafa] sm:text-[28px]">
          <ShoppingBasket className="h-6 w-6 text-violet-700 dark:text-violet-300" aria-hidden />
          {DESPENSA_PLAN_COPY.title}
        </h1>
        <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{DESPENSA_PLAN_COPY.intro}</p>
      </header>

      <section aria-labelledby="despensa-budget" className="mt-4 rounded-2xl border border-[#e5e5e7] bg-white p-4 dark:border-[#262626] dark:bg-[#141414]">
        <div className="flex flex-wrap items-center gap-2">
          <Wallet className="h-4 w-4 text-violet-700 dark:text-violet-300" aria-hidden />
          <h2 id="despensa-budget" className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
            {DESPENSA_BUDGET_COPY.settingsTitle}
          </h2>
          {ready && budget && !editingBudget ? (
            <>
              <span className="text-[14px] text-[#6e6e73] dark:text-[#a3a3a3]">{describeDespensaBudget(budget)}</span>
              <button type="button" onClick={() => setEditingBudget(true)} className="text-[13px] font-semibold text-violet-700 hover:underline dark:text-violet-300">
                Cambiar
              </button>
            </>
          ) : null}
        </div>
        {ready && (!budget || editingBudget) ? (
          <div className="mt-3">
            {!budget ? (
              <p className="mb-3 text-[13px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{DESPENSA_BUDGET_COPY.settingsEmpty}</p>
            ) : null}
            <DespensaBudgetEditor
              key={budget?.updatedAt ?? 'new'}
              initial={budget}
              saving={saving}
              onSave={(b) => void saveBudget(b)}
              onCancel={budget ? () => setEditingBudget(false) : undefined}
              onClear={budget ? () => void saveBudget(null) : undefined}
            />
          </div>
        ) : null}
        {budgetError ? <p role="alert" className="mt-2 text-[12px] text-rose-700 dark:text-rose-400">{DESPENSA_BUDGET_COPY.saveFailed}</p> : null}
        <p className="mt-2 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">{DESPENSA_PLAN_COPY.shareRule}</p>
        {estimate.count > 0 ? (
          <a href="#mi-lista" className="mt-2 inline-block text-[13px] font-semibold text-violet-700 hover:underline dark:text-violet-300 lg:hidden">
            Mi lista: {estimate.count} · {formatMxnCents(estimate.totalMxn)} estimado
          </a>
        ) : null}
      </section>

      <nav aria-label="Pasillos" className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <button type="button" className={chip(aisle === 'all')} aria-pressed={aisle === 'all'} onClick={() => setAisle('all')}>
          Todo
        </button>
        {DESPENSA_AISLES.map((a) => (
          <button
            key={a.id}
            type="button"
            className={chip(aisle === a.id)}
            aria-pressed={aisle === a.id}
            onClick={() => setAisle(a.id)}
          >
            {a.label}
            {plan && aislesWithOffers.has(a.id) ? ` · ${plan.needs.filter((n) => n.aisle === a.id).length}` : ''}
          </button>
        ))}
      </nav>

      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="despensa-offers" className="min-w-0">
          <h2 id="despensa-offers" className="sr-only">Ofertas por necesidad</h2>
          {load.status === 'loading' ? <p role="status" className="text-[14px] text-[#6e6e73]">Cargando ofertas de despensa…</p> : null}
          {load.status === 'error' ? (
            <div role="alert" className="rounded-2xl border border-[#e5e5e7] bg-white p-4 dark:border-[#262626] dark:bg-[#141414]">
              <p className="text-[15px] font-medium">No se pudieron cargar las ofertas.</p>
              <button type="button" onClick={() => void fetchOffers()} className="mt-2 text-[13px] font-semibold text-violet-700 hover:underline dark:text-violet-300">
                Reintentar
              </button>
            </div>
          ) : null}
          {plan ? (
            <>
              {plan.needs.length === 0 ? (
                <p className="rounded-2xl border border-[#e5e5e7] bg-white p-4 text-[14px] dark:border-[#262626] dark:bg-[#141414]">{DESPENSA_PLAN_COPY.noOffers}</p>
              ) : null}
              {plan.needs.length > 0 && plan.verifiedCount === 0 ? (
                <p className="mb-3 text-[13px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">
                  Esta semana ninguna oferta tiene ahorro verificado con el historial de Aventa. Te mostramos precios observados y por unidad para que compares.
                </p>
              ) : null}
              {plan.needs.length > 0 && visibleNeeds.length === 0 ? (
                <p className="text-[14px] text-[#6e6e73] dark:text-[#a3a3a3]">{DESPENSA_PLAN_COPY.emptyAisle}</p>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                {visibleNeeds.map((n) => (
                  <DespensaNeedSection key={n.need.id} plan={n} selected={selected} onToggle={toggle} />
                ))}
              </div>
              {visibleGaps.length > 0 ? (
                <section className="mt-6" aria-labelledby="despensa-gaps">
                  <h2 id="despensa-gaps" className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
                    {DESPENSA_PLAN_COPY.referenceGapsTitle}
                  </h2>
                  <p className="mt-1 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">{DESPENSA_PLAN_COPY.referenceGapsHelp}</p>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {visibleGaps.map((g) => (
                      <li key={`${g.needId}-${g.label}`} className="rounded-full bg-[#f5f5f7] px-3 py-1 text-[12px] text-[#424245] dark:bg-[#1c1c1e] dark:text-[#d4d4d4]">
                        {g.label} · {g.presentation}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {plan.staleCount > 0 ? (
                <p className="mt-4 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">
                  {plan.staleCount === 1 ? '1 oferta tiene' : `${plan.staleCount} ofertas tienen`} un precio de hace más de 7 días y no se recomienda{plan.staleCount === 1 ? '' : 'n'}.
                </p>
              ) : null}
            </>
          ) : null}
        </section>

        <aside
          id="mi-lista"
          aria-labelledby="despensa-list"
          className="scroll-mt-20 rounded-2xl border border-[#e5e5e7] bg-white p-4 dark:border-[#262626] dark:bg-[#141414] lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto"
        >
          <h2 id="despensa-list" className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#fafafa]">
            Mi lista · {estimate.count} {estimate.count === 1 ? 'producto' : 'productos'}
          </h2>
          <p className="mt-1 text-[14px] text-[#1d1d1f] dark:text-[#fafafa]">
            Gasto estimado: <strong>{formatMxnCents(estimate.totalMxn)}</strong>
            {estimate.budgetMxn != null ? (
              <span className="text-[#6e6e73] dark:text-[#a3a3a3]">
                {' '}de {formatMxnCents(estimate.budgetMxn)} {estimate.horizon === 'weekly' ? 'a la semana' : 'al mes'} ({estimate.sharePct}%)
              </span>
            ) : null}
          </p>
          {estimate.remainingMxn != null && estimate.remainingMxn < 0 ? (
            <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-400">
              Supera tu presupuesto por {formatMxnCents(-estimate.remainingMxn)}.
            </p>
          ) : null}
          {list.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {list.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-2 text-[13px]">
                  <Link href={buildOfferPublicPath(item.id, item.title)} className="line-clamp-2 min-w-0 text-[#1d1d1f] hover:underline dark:text-[#fafafa]">
                    {item.title}
                    {load.status === 'ready' && !liveIds.has(item.id) ? (
                      <span className="text-[#6e6e73] dark:text-[#a3a3a3]"> · ya no está en las ofertas de esta semana</span>
                    ) : null}
                  </Link>
                  <span className="flex shrink-0 items-center gap-1">
                    {formatMxnCents(item.price)}
                    <button type="button" onClick={() => removeItem(item.id)} aria-label={`Quitar ${item.title}`} className="-m-1 p-2.5 text-[#6e6e73] hover:text-rose-700">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-[#6e6e73] dark:text-[#a3a3a3]">Agrega productos para estimar tu gasto.</p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-[#6e6e73] dark:text-[#a3a3a3]">{DESPENSA_PLAN_COPY.disclaimer}</p>
        </aside>
      </div>
    </div>
  );
}
