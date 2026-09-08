'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Tag,
  Heart,
  Target,
} from 'lucide-react';
import RewardsUnlockCeremony, { type CeremonyStep } from '@/app/me/RewardsUnlockCeremony';
import RewardsOfferSelection, {
  type WelcomeChoiceCard,
} from '@/app/me/RewardsOfferSelection';
import MysteryGiftBox from '@/app/me/MysteryGiftBox';

type ClaimPhase = 'locked' | 'unlocked' | 'pending_selection' | 'complete';

type StatusPayload = {
  programName: string;
  programActive: boolean;
  surpriseMode?: boolean;
  claimPhase?: ClaimPhase;
  encouragement?: string | null;
  progress: {
    approvedOffers: number;
    requiredOffers: number;
    positiveVotes: number;
    requiredVotes: number;
    unlocked: boolean;
    unlockedAt: string | null;
  };
  welcome: {
    needsSelection: boolean;
    welcomeOfferId: string | null;
    selectedAt?: string | null;
    welcomeOffer: {
      id: string;
      title: string;
      image_url?: string | null;
      store?: string | null;
      selectedAt?: string | null;
    } | null;
    choices: WelcomeChoiceCard[];
  };
  terms?: {
    version: string;
    acceptedAt: string | null;
    acceptedVersion: string | null;
    current: boolean;
    needsAcceptance?: boolean;
    href: string;
  };
  balances: {
    validatingCents: number;
    availableCents: number;
    paidCents: number;
  };
  policy: { creatorShareBps: number; minPayoutCents: number; holdDays: number };
};

function centsToMx(cents: number): string {
  return (cents / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function ProgressMeter({
  label,
  current,
  required,
  icon: Icon,
}: {
  label: string;
  current: number;
  required: number;
  icon: typeof Tag;
}) {
  const pct = required > 0 ? Math.min(100, Math.round((current / required) * 100)) : 0;
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-[#0e0e10] p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-400">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      </div>
      <p className="mb-2 text-xl font-bold tabular-nums text-white">
        {current} <span className="text-zinc-500">/</span> {required}
      </p>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-zinc-800"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${current} de ${required}`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function resolveClaimPhase(data: StatusPayload): ClaimPhase {
  if (data.claimPhase) return data.claimPhase;
  if (!data.progress.unlocked) return 'locked';
  if (data.welcome.welcomeOfferId) return 'complete';
  if (data.terms?.current) return 'pending_selection';
  return 'unlocked';
}

/**
 * Programa del Cazador — shell premium.
 * Lógica y fases intactas; solo presentación.
 */
export default function RewardsProgramPanel() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ceremonyOpen, setCeremonyOpen] = useState(false);
  const [ceremonyStep, setCeremonyStep] = useState<CeremonyStep>('hello');
  const [submitting, setSubmitting] = useState(false);
  const [ceremonyError, setCeremonyError] = useState<string | null>(null);
  const [selectingOffer, setSelectingOffer] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const applyPayload = useCallback((payload: StatusPayload) => {
    setData(payload);
  }, []);

  const reload = useCallback(async () => {
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
      const res = await fetch('/api/me/rewards/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof body?.error === 'string' ? body.error : 'No se pudo cargar');
        setData(null);
        return;
      }
      applyPayload(body as StatusPayload);
    } catch {
      setError('Error de red');
    } finally {
      setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          if (active) setData(null);
          return;
        }
        const res = await fetch('/api/me/rewards/status', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          setError(typeof body?.error === 'string' ? body.error : 'No se pudo cargar');
          setData(null);
          return;
        }
        applyPayload(body as StatusPayload);
      } catch {
        if (active) setError('Error de red');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [applyPayload]);

  const openCeremony = () => {
    setCeremonyError(null);
    setCeremonyStep('hello');
    setCeremonyOpen(true);
  };

  const closeCeremony = () => {
    if (submitting) return;
    setCeremonyOpen(false);
    setCeremonyError(null);
  };

  const submitTerms = async () => {
    setSubmitting(true);
    setCeremonyError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setCeremonyError('Inicia sesión de nuevo');
        return;
      }
      const res = await fetch('/api/me/rewards/accept-terms', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accept: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCeremonyError(
          typeof body?.error === 'string' ? body.error : 'No se pudo registrar la aceptación',
        );
        return;
      }
      setCeremonyOpen(false);
      await reload();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aventa:rewards-updated'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const confirmWelcomeOffer = async (offerId: string) => {
    setSelectingOffer(true);
    setSelectionError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setSelectionError('Inicia sesión de nuevo');
        return;
      }
      const res = await fetch('/api/me/rewards/welcome-offer', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ offerId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSelectionError(
          typeof body?.error === 'string' ? body.error : 'No se pudo confirmar la recompensa',
        );
        return;
      }
      await reload();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aventa:rewards-updated'));
      }
    } finally {
      setSelectingOffer(false);
    }
  };

  if (loading) {
    return (
      <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-[#0c0c0e] p-8">
        <div className="h-3 w-32 animate-pulse rounded bg-zinc-800" />
        <div className="mt-4 h-8 w-64 max-w-full animate-pulse rounded bg-zinc-800" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="h-24 animate-pulse rounded-2xl bg-zinc-900" />
          <div className="h-24 animate-pulse rounded-2xl bg-zinc-900" />
        </div>
        <p className="mt-4 text-sm text-zinc-500">Cargando programa del cazador…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        id="hunter-rewards-panel"
        className="scroll-mt-24 rounded-3xl border border-zinc-800 bg-[#0c0c0e] p-5 sm:p-6"
        role="alert"
      >
        <p className="text-sm font-medium text-zinc-200">
          No se pudo cargar el Programa del Cazador.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {error ?? 'Intenta de nuevo en un momento.'}
        </p>
        <button
          type="button"
          onClick={() => void reload()}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const p = data.progress;
  const phase = resolveClaimPhase(data);
  const sharePct = Math.round(data.policy.creatorShareBps / 100);
  const termsHref = data.terms?.href ?? '/terms#comisiones';

  return (
    <>
      <section
        id="hunter-rewards-panel"
        className="relative scroll-mt-24 overflow-hidden rounded-3xl border border-zinc-800/90 bg-gradient-to-br from-[#141418] via-[#0c0c0e] to-[#0a0a0c] shadow-[0_0_60px_-20px_rgba(139,92,246,0.35)]"
        aria-label="Programa del Cazador"
      >
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-violet-600/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl"
          aria-hidden
        />

        <div className="relative p-5 sm:p-7 md:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-400/90">
            Programa del Cazador
          </p>

          {phase === 'locked' ? (
            <div className="mt-4 grid items-center gap-5 sm:gap-6 md:grid-cols-[minmax(0,1fr)_minmax(220px,42%)] lg:gap-4">
              <div className="min-w-0 space-y-3">
                <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Hay algo{' '}
                  <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(167,139,250,0.5)]">
                    esperándote…
                  </span>
                </h2>
                <p className="max-w-lg text-sm leading-relaxed text-zinc-400">
                  Publica ofertas que realmente valgan la pena y recibe un reconocimiento por tu
                  aporte a la comunidad.
                </p>
                {data.encouragement?.trim() ? (
                  <p className="text-sm text-violet-300/90">{data.encouragement.trim()}</p>
                ) : (
                  <p className="text-sm text-zinc-500">¡Estás cada vez más cerca!</p>
                )}
              </div>

              <MysteryGiftBox className="mx-auto w-full md:row-span-3 md:mx-0 md:justify-self-end" />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ProgressMeter
                  label="Ofertas aprobadas"
                  current={p.approvedOffers}
                  required={p.requiredOffers}
                  icon={Tag}
                />
                <ProgressMeter
                  label="Votos positivos"
                  current={p.positiveVotes}
                  required={p.requiredVotes}
                  icon={Heart}
                />
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-violet-500/20 bg-violet-950/30 px-4 py-3 text-xs leading-relaxed text-zinc-400">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" aria-hidden />
                <div>
                  <p>
                    Tu próxima{' '}
                    <span className="font-medium text-violet-300">recompensa</span> se desbloquea al
                    cumplir los requisitos.
                  </p>
                  <p className="mt-1">
                    Los votos no garantizan ingresos, pero ayudan a reconocer tu aporte.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {phase === 'unlocked' ? (
            <div className="mt-4 grid items-center gap-8 lg:grid-cols-[1fr_auto]">
              <div className="space-y-5 text-center lg:text-left">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/30">
                  <Sparkles className="h-6 w-6" aria-hidden />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white sm:text-3xl">
                    ¡Lo lograste, cazador!
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400 lg:mx-0 mx-auto">
                    Has completado el desafío. AVENTA quiere reconocer tu aporte — hay una
                    recompensa esperándote.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCeremony}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-violet-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_0_24px_-4px_rgba(139,92,246,0.6)] transition hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0c0e] sm:w-auto"
                >
                  Descubrir recompensa
                </button>
                <p className="text-[11px] text-zinc-500">
                  Todavía no se confirma nada. Primero te contamos el reconocimiento y pedimos tu
                  aceptación de términos.
                </p>
              </div>
              <MysteryGiftBox className="mx-auto lg:mx-0" />
            </div>
          ) : null}

          {phase === 'pending_selection' ? (
            <div className="mt-4 space-y-4">
              <div>
                <h2 className="text-2xl font-bold text-white sm:text-3xl">
                  Tu recompensa está lista
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  Elige una de tus ofertas para activar el reconocimiento.
                </p>
              </div>
              <RewardsOfferSelection
                choices={data.welcome.choices ?? []}
                confirming={selectingOffer}
                error={selectionError}
                onConfirm={(offerId) => void confirmWelcomeOffer(offerId)}
              />
            </div>
          ) : null}

          {phase === 'complete' ? (
            <div className="mt-4 space-y-5">
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
                  <div className="min-w-0 space-y-1">
                    <h2 className="text-xl font-bold text-white sm:text-2xl">Recompensa activada</h2>
                    <p className="text-sm text-zinc-400">
                      Tu reconocimiento quedó registrado. Puedes verlo en Mis recompensas.
                    </p>
                  </div>
                </div>

                {data.welcome.welcomeOffer ? (
                  <div className="mt-4 flex gap-3 rounded-2xl border border-zinc-800 bg-[#0e0e10] p-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-900">
                      {data.welcome.welcomeOffer.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={data.welcome.welcomeOffer.image_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                        Oferta seleccionada
                      </p>
                      <p className="line-clamp-2 text-sm font-semibold text-zinc-100">
                        {data.welcome.welcomeOffer.title}
                      </p>
                      {data.welcome.welcomeOffer.store ? (
                        <p className="text-xs text-zinc-500">{data.welcome.welcomeOffer.store}</p>
                      ) : null}
                      <p className="text-[11px] text-zinc-500">
                        Estado:{' '}
                        <span className="font-medium text-emerald-400">Confirmada</span>
                        {data.welcome.selectedAt || data.welcome.welcomeOffer.selectedAt ? (
                          <>
                            {' · '}
                            {new Date(
                              data.welcome.selectedAt ??
                                data.welcome.welcomeOffer.selectedAt ??
                                '',
                            ).toLocaleString('es-MX')}
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>

              {data.programActive ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-zinc-800 bg-[#0e0e10] p-3">
                      <p className="text-[10px] uppercase text-zinc-500">En validación</p>
                      <p className="font-semibold text-white">
                        {centsToMx(data.balances.validatingCents)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-[#0e0e10] p-3">
                      <p className="text-[10px] uppercase text-zinc-500">Disponible</p>
                      <p className="font-semibold text-white">
                        {centsToMx(data.balances.availableCents)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-[#0e0e10] p-3">
                      <p className="text-[10px] uppercase text-zinc-500">Pagado</p>
                      <p className="font-semibold text-white">
                        {centsToMx(data.balances.paidCents)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Hasta el {sharePct}% de comisiones reales atribuibles, tras{' '}
                    {data.policy.holdDays} días. Mínimo {centsToMx(data.policy.minPayoutCents)}.
                    Sin comisión atribuible no hay recompensa.
                  </p>
                </>
              ) : (
                <p className="text-xs text-zinc-500">
                  Tu reconocimiento quedó registrado. Cuando el programa abra públicamente, AVENTA
                  lo anunciará — sin promesas de pago mientras esté cerrado.
                </p>
              )}

              {!data.programActive ? (
                <div className="flex items-start gap-2 text-xs text-amber-400/90">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>Programa aún no activo públicamente.</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {phase !== 'locked' ? (
            <p className="mt-6 text-xs text-zinc-500">
              <Link href="/comisiones" className="font-medium text-violet-400 hover:underline">
                Cómo funciona
              </Link>
              {' · '}
              <Link href={termsHref} className="font-medium text-violet-400 hover:underline">
                Términos (sección 8)
              </Link>
            </p>
          ) : null}
        </div>
      </section>

      <RewardsUnlockCeremony
        open={ceremonyOpen}
        step={ceremonyStep}
        termsHref={termsHref}
        submitting={submitting}
        error={ceremonyError}
        onClose={closeCeremony}
        onContinueFromHello={() => {
          setCeremonyStep('terms');
          setCeremonyError(null);
        }}
        onAcceptTerms={() => void submitTerms()}
      />
    </>
  );
}
