'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  Gift,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Eye,
} from 'lucide-react';
import RewardsUnlockCeremony, { type CeremonyStep } from '@/app/me/RewardsUnlockCeremony';
import RewardsOfferSelection, {
  type WelcomeChoiceCard,
} from '@/app/me/RewardsOfferSelection';

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
}: {
  label: string;
  current: number;
  required: number;
}) {
  const pct = required > 0 ? Math.min(100, Math.round((current / required) * 100)) : 0;
  return (
    <div className="rounded-xl bg-white/80 dark:bg-[#1a1a1a] p-3 border border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
          {current} / {required}
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className="h-full rounded-full bg-violet-600 transition-all duration-500 ease-out"
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
 * Recompensa sorpresa del Cazador (Fase 3).
 * Progreso desde API (umbrales configurables en servidor).
 * Abrir el modal NO otorga nada — solo POST /accept-terms registra consentimiento.
 */
export default function RewardsProgramPanel() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [ceremonyOpen, setCeremonyOpen] = useState(false);
  const [ceremonyStep, setCeremonyStep] = useState<CeremonyStep>('hello');
  const [submitting, setSubmitting] = useState(false);
  const [ceremonyError, setCeremonyError] = useState<string | null>(null);
  const [selectingOffer, setSelectingOffer] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const applyPayload = useCallback((payload: StatusPayload) => {
    setData(payload);
    const phase = resolveClaimPhase(payload);
    if (phase === 'unlocked' || phase === 'pending_selection') setExpanded(true);
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
      <div className="rounded-2xl border border-violet-200/60 dark:border-violet-800/40 bg-white/80 dark:bg-[#141414] p-4 text-sm text-gray-500">
        Cargando recompensa sorpresa…
      </div>
    );
  }

  if (error || !data) return null;

  const p = data.progress;
  const phase = resolveClaimPhase(data);
  const sharePct = Math.round(data.policy.creatorShareBps / 100);
  const termsHref = data.terms?.href ?? '/terms#comisiones';

  return (
    <>
      <div
        id="hunter-rewards-panel"
        className="rounded-2xl border border-violet-200/60 dark:border-violet-800/40 bg-gradient-to-br from-violet-50/80 via-white to-white dark:from-violet-950/25 dark:via-[#141414] dark:to-[#141414] overflow-hidden shadow-sm scroll-mt-24"
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-3 p-4 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            {phase === 'unlocked' ? (
              <Sparkles className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />
            ) : (
              <Gift className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />
            )}
            <div className="min-w-0">
              <span className="font-semibold text-gray-900 dark:text-gray-100 block truncate">
                Recompensa sorpresa
              </span>
              {phase === 'locked' ? (
                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                  Reconocimiento por calidad · no un ingreso garantizado
                </span>
              ) : null}
            </div>
            {phase === 'unlocked' ? (
              <span className="shrink-0 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Lista
              </span>
            ) : null}
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>

        {expanded ? (
          <div className="border-t border-violet-100 dark:border-violet-900/40 px-4 pb-4 pt-3 space-y-4 text-sm">
            {phase === 'locked' ? (
              <>
                <div className="rounded-xl border border-dashed border-violet-300/80 dark:border-violet-700/60 bg-violet-50/50 dark:bg-violet-950/20 p-4 text-center space-y-2">
                  <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                    <Eye className="h-5 w-5" aria-hidden />
                  </div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    Tu próxima recompensa está oculta
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 max-w-sm mx-auto leading-relaxed">
                    {data.encouragement?.trim() ||
                      'Continúa cazando ofertas de calidad para desbloquearla.'}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ProgressMeter
                    label="Ofertas aprobadas"
                    current={p.approvedOffers}
                    required={p.requiredOffers}
                  />
                  <ProgressMeter
                    label="Votos positivos"
                    current={p.positiveVotes}
                    required={p.requiredVotes}
                  />
                </div>

                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                  Los umbrales vienen del servidor y pueden cambiar. Los votos no garantizan
                  ingresos.
                </p>
              </>
            ) : null}

            {phase === 'unlocked' ? (
              <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-gradient-to-b from-violet-50 to-white dark:from-violet-950/40 dark:to-[#141414] p-5 space-y-4 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-violet-600/10 text-violet-700 dark:text-violet-300 ring-1 ring-violet-500/20">
                  <Sparkles className="h-6 w-6" aria-hidden />
                </div>
                <div className="space-y-2">
                  <p className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                    ¡Lo lograste, cazador!
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed max-w-sm mx-auto">
                    Has completado el desafío y tienes una recompensa esperándote.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openCeremony}
                  className="w-full sm:w-auto inline-flex items-center justify-center rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-semibold px-6 py-3 text-sm shadow-sm transition-colors"
                >
                  Descubrir recompensa
                </button>
                <p className="text-[11px] text-gray-500 dark:text-gray-500">
                  Todavía no se confirma nada. Primero te contamos el reconocimiento y pedimos
                  tu aceptación de términos.
                </p>
              </div>
            ) : null}

            {phase === 'pending_selection' ? (
              <RewardsOfferSelection
                choices={data.welcome.choices ?? []}
                confirming={selectingOffer}
                error={selectionError}
                onConfirm={(offerId) => void confirmWelcomeOffer(offerId)}
              />
            ) : null}

            {phase === 'complete' ? (
              <>
                <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 p-5 space-y-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                    <div className="min-w-0 space-y-1">
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                        ¡Recompensa activada!
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Tu recompensa ha sido registrada correctamente.
                      </p>
                    </div>
                  </div>

                  {data.welcome.welcomeOffer ? (
                    <div className="flex gap-3 rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-white/80 dark:bg-[#141414] p-3">
                      <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-gray-100 dark:bg-[#1a1a1a]">
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
                        <p className="text-[11px] uppercase tracking-wide text-gray-500">
                          Oferta seleccionada
                        </p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                          {data.welcome.welcomeOffer.title}
                        </p>
                        {data.welcome.welcomeOffer.store ? (
                          <p className="text-xs text-gray-500">{data.welcome.welcomeOffer.store}</p>
                        ) : null}
                        <p className="text-[11px] text-gray-500">
                          Estado: <span className="font-medium text-emerald-700 dark:text-emerald-400">Confirmada</span>
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
                      <div className="rounded-lg bg-white/70 dark:bg-[#1a1a1a] p-2 border border-gray-100 dark:border-gray-800">
                        <p className="text-[10px] uppercase text-gray-500">En validación</p>
                        <p className="font-semibold">{centsToMx(data.balances.validatingCents)}</p>
                      </div>
                      <div className="rounded-lg bg-white/70 dark:bg-[#1a1a1a] p-2 border border-gray-100 dark:border-gray-800">
                        <p className="text-[10px] uppercase text-gray-500">Disponible</p>
                        <p className="font-semibold">{centsToMx(data.balances.availableCents)}</p>
                      </div>
                      <div className="rounded-lg bg-white/70 dark:bg-[#1a1a1a] p-2 border border-gray-100 dark:border-gray-800">
                        <p className="text-[10px] uppercase text-gray-500">Pagado</p>
                        <p className="font-semibold">{centsToMx(data.balances.paidCents)}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Hasta el {sharePct}% de comisiones reales atribuibles, tras{' '}
                      {data.policy.holdDays} días. Mínimo {centsToMx(data.policy.minPayoutCents)}.
                      Sin comisión atribuible no hay recompensa.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Tu reconocimiento quedó registrado. Cuando el programa abra públicamente,
                    AVENTA lo anunciará — sin promesas de pago mientras esté cerrado.
                  </p>
                )}

                {!data.programActive ? (
                  <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400 text-xs">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Programa aún no activo públicamente.</span>
                  </div>
                ) : null}
              </>
            ) : null}

            {phase !== 'locked' ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <Link
                  href="/comisiones"
                  className="text-violet-600 dark:text-violet-400 hover:underline font-medium"
                >
                  Cómo funciona
                </Link>
                {' · '}
                <Link
                  href={termsHref}
                  className="text-violet-600 dark:text-violet-400 hover:underline font-medium"
                >
                  Términos (sección 8)
                </Link>
              </p>
            ) : null}
          </div>
        ) : phase === 'unlocked' ? (
          <div className="px-4 pb-4 -mt-1">
            <p className="text-xs text-violet-700 dark:text-violet-300">
              Tienes una recompensa lista. Abre para descubrirla.
            </p>
          </div>
        ) : null}
      </div>

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
