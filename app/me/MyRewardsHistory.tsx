'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Gift, Trophy, CheckCircle2, Clock, XCircle } from 'lucide-react';

type ClaimPhase = 'locked' | 'unlocked' | 'pending_selection' | 'complete';

type OfferSnippet = {
  id: string;
  title: string;
  image_url: string | null;
  store: string | null;
  price: number | null;
};

type HistoryPayload = {
  welcome: {
    claimPhase: ClaimPhase;
    displayNumber: number;
    unlockedAt: string | null;
    termsAcceptedAt: string | null;
    selectedAt: string | null;
    offer: OfferSnippet | null;
    needsSelection: boolean;
  };
  rewards: Array<{
    id: string;
    kind: 'commission';
    status: string;
    uiStatus: 'validating' | 'available' | 'delivered' | 'cancelled';
    statusLabel: string;
    network: string | null;
    createdAt: string;
    paidAt: string | null;
    offer: OfferSnippet | null;
  }>;
};

function formatMx(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '';
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function OfferMini({ offer }: { offer: OfferSnippet }) {
  return (
    <div className="flex gap-3 rounded-xl border border-zinc-800 bg-[#0e0e10] p-2.5">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-900">
        {offer.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={offer.image_url} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-medium text-zinc-100">{offer.title}</p>
        {offer.store ? <p className="text-xs text-zinc-500">{offer.store}</p> : null}
        {offer.price != null ? (
          <p className="text-xs font-semibold text-violet-300">{formatMx(offer.price)}</p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Historial privado de reconocimientos del cazador.
 * No mostrar en perfil público.
 */
export default function MyRewardsHistory() {
  const [data, setData] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setData(null);
        return;
      }
      const res = await fetch('/api/me/rewards', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'No se pudo cargar');
        setData(null);
        return;
      }
      setData(body as HistoryPayload);
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onUpdate = () => {
      void load();
    };
    window.addEventListener('aventa:rewards-updated', onUpdate);
    return () => window.removeEventListener('aventa:rewards-updated', onUpdate);
  }, [load]);

  const scrollToProgram = () => {
    const el = document.getElementById('hunter-rewards-panel');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <section className="mb-4" aria-label="Mis recompensas">
        <h2 className="text-lg font-semibold text-white">Mis recompensas</h2>
        <div className="mt-3 h-28 animate-pulse rounded-2xl bg-zinc-900" />
      </section>
    );
  }

  if (error) {
    return (
      <section className="mb-4" aria-label="Mis recompensas">
        <h2 className="text-lg font-semibold text-white">Mis recompensas</h2>
        <p className="mt-3 text-sm text-red-400">{error}</p>
      </section>
    );
  }

  const welcome = data?.welcome;
  const phase = welcome?.claimPhase ?? 'locked';
  const commissionRewards = data?.rewards ?? [];
  const hasWelcomePending = phase === 'pending_selection';
  const hasWelcomeComplete = phase === 'complete';
  const isEmpty = !hasWelcomePending && !hasWelcomeComplete && commissionRewards.length === 0;

  return (
    <section className="mb-4 space-y-3" aria-label="Mis recompensas">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Trophy className="h-5 w-5 text-violet-400" aria-hidden />
          Mis recompensas
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Reconocimientos por aportar valor a la comunidad.
        </p>
      </div>

      {isEmpty ? (
        <div className="space-y-2 rounded-2xl border border-dashed border-violet-500/30 bg-violet-950/20 p-6 text-center">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
            <Gift className="h-5 w-5" aria-hidden />
          </div>
          <p className="font-medium text-zinc-100">Todavía no tienes recompensas.</p>
          <p className="mx-auto max-w-sm text-sm leading-relaxed text-zinc-400">
            Continúa cazando ofertas de calidad. Tu próximo reconocimiento podría estar más cerca
            de lo que crees.
          </p>
        </div>
      ) : null}

      {hasWelcomePending ? (
        <div className="space-y-3 rounded-2xl border border-violet-500/30 bg-violet-950/25 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
              <Gift className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-zinc-100">Recompensa pendiente</p>
              <p className="text-sm leading-relaxed text-zinc-400">
                Ya desbloqueaste una recompensa.
              </p>
              <p className="text-sm leading-relaxed text-zinc-400">
                Elige una de tus ofertas elegibles para continuar.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={scrollToProgram}
            className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500"
          >
            Elegir mi oferta
          </button>
        </div>
      ) : null}

      {hasWelcomeComplete ? (
        <article className="space-y-3 rounded-2xl border border-zinc-800 bg-[#121214] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-violet-400" aria-hidden />
              <h3 className="font-semibold text-zinc-100">
                Recompensa #{String(welcome?.displayNumber ?? 1).padStart(3, '0')}
              </h3>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              Activada
            </span>
          </div>
          <p className="text-xs text-zinc-500">
            Fecha:{' '}
            <span className="font-medium text-zinc-300">{formatDate(welcome?.selectedAt)}</span>
          </p>
          {welcome?.offer ? (
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">Oferta seleccionada</p>
              <OfferMini offer={welcome.offer} />
            </div>
          ) : null}
        </article>
      ) : null}

      {commissionRewards.map((r, index) => {
        const num = (hasWelcomeComplete ? 2 : 1) + index;
        const Icon =
          r.uiStatus === 'delivered'
            ? CheckCircle2
            : r.uiStatus === 'cancelled'
              ? XCircle
              : Clock;
        const badgeClass =
          r.uiStatus === 'delivered'
            ? 'bg-emerald-500/15 text-emerald-400'
            : r.uiStatus === 'cancelled'
              ? 'bg-red-500/15 text-red-400'
              : 'bg-amber-500/15 text-amber-300';

        return (
          <article
            key={r.id}
            className="space-y-3 rounded-2xl border border-zinc-800 bg-[#121214] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-violet-400" aria-hidden />
                <h3 className="font-semibold text-zinc-100">
                  Recompensa #{String(num).padStart(3, '0')}
                </h3>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}
              >
                <Icon className="h-3 w-3" aria-hidden />
                {r.statusLabel}
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Fecha:{' '}
              <span className="font-medium text-zinc-300">
                {formatDate(r.paidAt ?? r.createdAt)}
              </span>
            </p>
            {r.offer ? (
              <div className="space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Oferta asociada</p>
                <OfferMini offer={r.offer} />
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                Reconocimiento vinculado a una comisión atribuida.
              </p>
            )}
          </article>
        );
      })}
    </section>
  );
}
