'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BadgePercent,
  Clock,
  Gift,
  Lock,
  Search,
  Send,
  ShieldCheck,
  ThumbsUp,
  Unlock,
  Wallet,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { MeSpaceShell, meCardClass } from '@/app/me/dashboard/MeSectionPage';
import RewardsBetaOnboarding from '@/app/me/RewardsBetaOnboarding';
import RewardsOfferSelection, { type WelcomeChoiceCard } from '@/app/me/RewardsOfferSelection';
import { formatRewardShare } from '@/lib/me/rewardStatusCopy';
import { PROGRAM_STATUS_COPY, resolveRewardsProgramStatus } from '@/lib/rewards/onboarding';

type Progress = {
  approvedOffers: number;
  requiredOffers: number;
  positiveVotes: number;
  requiredVotes: number;
  unlocked: boolean;
};

type Policy = {
  creatorShareBps: number;
  minPayoutCents: number;
  holdDays: number;
};

type Balances = {
  validatingCents: number;
  availableCents: number;
  paidCents: number;
};

type WelcomeOffer = {
  id: string;
  title: string;
  image_url: string | null;
  store: string | null;
};

type BetaStatus = {
  audience: 'closed' | 'program' | 'beta';
  needsOnboarding: boolean;
  payoutEnabled: boolean;
  canSeeEconomics: boolean;
  steps: { id: string; title: string; body: string[] }[];
};

type StatusPayload = {
  programActive: boolean;
  moneyPathFrozen: boolean;
  progress: Progress;
  welcome: {
    needsSelection: boolean;
    welcomeOffer: WelcomeOffer | null;
    choices: WelcomeChoiceCard[];
  };
  balances: Balances;
  policy: Policy;
  beta: BetaStatus;
};

type RewardRow = {
  id: string;
  status: string;
  uiStatus: string;
  statusLabel: string;
  isSynthetic: boolean;
  createdAt: string;
  paidAt: string | null;
  shareCents: number | null;
  currency: string | null;
  offer: { title: string; store: string | null; image_url: string | null } | null;
};

const PATH_STEPS = [
  { title: 'Caza', body: 'Encuentra ofertas que realmente valgan la pena.', icon: Search },
  { title: 'Publica', body: 'Compártelas con la comunidad.', icon: Send },
  { title: 'Consigue votos', body: 'Tus ofertas ayudan a otros cazadores y reciben votos.', icon: ThumbsUp },
  { title: 'Desbloquea', body: 'Cumple las ofertas aprobadas y los votos positivos.', icon: Unlock },
  { title: 'Elige tu Oferta de Bienvenida', body: 'Selecciona una de tus primeras ofertas aprobadas.', icon: Gift },
] as const;

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function money(cents: number, currency = 'MXN'): string {
  return formatRewardShare(cents, currency) ?? '—';
}

function clampPct(current: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / total) * 100)));
}

function asChoices(value: unknown): WelcomeChoiceCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.title !== 'string') return [];
    return [
      {
        id: row.id,
        title: row.title,
        created_at: typeof row.created_at === 'string' ? row.created_at : '',
        image_url: typeof row.image_url === 'string' ? row.image_url : null,
        store: typeof row.store === 'string' ? row.store : null,
        price: typeof row.price === 'number' ? row.price : null,
        original_price: typeof row.original_price === 'number' ? row.original_price : null,
        upvotes_count: num(row.upvotes_count),
        views: num(row.views),
        eligible: true as const,
        dealStatus: row.dealStatus === 'expired' ? ('expired' as const) : ('approved' as const),
      },
    ];
  });
}

function asRewards(value: unknown): RewardRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string') return [];
    const offer = row.offer && typeof row.offer === 'object' ? (row.offer as Record<string, unknown>) : null;
    return [
      {
        id: row.id,
        status: typeof row.status === 'string' ? row.status : '',
        uiStatus: typeof row.uiStatus === 'string' ? row.uiStatus : '',
        statusLabel: typeof row.statusLabel === 'string' ? row.statusLabel : '',
        isSynthetic: Boolean(row.isSynthetic) || row.uiStatus === 'synthetic',
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
        paidAt: typeof row.paidAt === 'string' ? row.paidAt : null,
        shareCents: typeof row.shareCents === 'number' ? row.shareCents : null,
        currency: typeof row.currency === 'string' ? row.currency : null,
        offer: offer
          ? {
              title: typeof offer.title === 'string' ? offer.title : 'Oferta',
              store: typeof offer.store === 'string' ? offer.store : null,
              image_url: typeof offer.image_url === 'string' ? offer.image_url : null,
            }
          : null,
      },
    ];
  });
}

function parseStatus(body: unknown): StatusPayload | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const progress = (raw.progress ?? {}) as Record<string, unknown>;
  const welcome = (raw.welcome ?? {}) as Record<string, unknown>;
  const balances = (raw.balances ?? {}) as Record<string, unknown>;
  const policy = (raw.policy ?? {}) as Record<string, unknown>;
  const beta = (raw.beta ?? {}) as Record<string, unknown>;
  const offer = welcome.welcomeOffer && typeof welcome.welcomeOffer === 'object'
    ? (welcome.welcomeOffer as Record<string, unknown>)
    : null;
  const audience = beta.audience === 'beta' || beta.audience === 'program' ? beta.audience : 'closed';
  return {
    programActive: Boolean(raw.programActive),
    moneyPathFrozen: Boolean(raw.moneyPathFrozen),
    progress: {
      approvedOffers: num(progress.approvedOffers),
      requiredOffers: num(progress.requiredOffers),
      positiveVotes: num(progress.positiveVotes),
      requiredVotes: num(progress.requiredVotes),
      unlocked: Boolean(progress.unlocked),
    },
    welcome: {
      needsSelection: Boolean(welcome.needsSelection),
      welcomeOffer:
        offer && typeof offer.id === 'string' && typeof offer.title === 'string'
          ? {
              id: offer.id,
              title: offer.title,
              image_url: typeof offer.image_url === 'string' ? offer.image_url : null,
              store: typeof offer.store === 'string' ? offer.store : null,
            }
          : null,
      choices: asChoices(welcome.choices),
    },
    balances: {
      validatingCents: num(balances.validatingCents),
      availableCents: num(balances.availableCents),
      paidCents: num(balances.paidCents),
    },
    policy: {
      creatorShareBps: num(policy.creatorShareBps),
      minPayoutCents: num(policy.minPayoutCents),
      holdDays: num(policy.holdDays),
    },
    beta: {
      audience,
      needsOnboarding: Boolean(beta.needsOnboarding),
      payoutEnabled: Boolean(beta.payoutEnabled),
      canSeeEconomics: Boolean(beta.canSeeEconomics),
      steps: Array.isArray(beta.steps) ? (beta.steps as BetaStatus['steps']) : [],
    },
  };
}

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ece8f6] dark:bg-white/10" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="h-full rounded-full bg-violet-600" style={{ width: `${value}%` }} />
    </div>
  );
}

function GiftCluster() {
  return (
    <div className="relative mx-auto h-44 w-44 sm:h-52 sm:w-52" aria-hidden>
      <div className="absolute left-6 top-8 h-28 w-28 rotate-[-8deg] rounded-[28px] bg-white/20" />
      <div className="absolute right-4 top-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-300 text-amber-950 shadow-lg">
        <span className="text-lg font-bold">$</span>
      </div>
      <div className="absolute bottom-6 left-2 flex h-11 w-11 items-center justify-center rounded-full bg-amber-200 text-amber-950">
        <span className="text-sm font-bold">$</span>
      </div>
      <div className="absolute bottom-3 right-8 flex h-10 w-10 items-center justify-center rounded-full bg-yellow-300/90 text-amber-950">
        <span className="text-sm font-bold">$</span>
      </div>
      <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[32px] bg-linear-to-br from-fuchsia-400 to-violet-700 shadow-[0_18px_40px_rgba(76,29,149,0.35)]">
        <Gift className="h-12 w-12 text-white" />
      </div>
    </div>
  );
}

function formatDay(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function statusTone(row: RewardRow): string {
  if (row.uiStatus === 'available') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
  if (row.uiStatus === 'delivered') return 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300';
  if (row.uiStatus === 'cancelled') return 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300';
  if (row.status === 'PENDING') return 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200';
  return 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200';
}

export default function RecompensasPage() {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selecting, setSelecting] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        if (active) setLoading(false);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const [statusRes, rewardsRes] = await Promise.all([
        fetch('/api/me/rewards/status', { headers }),
        fetch('/api/me/rewards', { headers }),
      ]);
      const statusBody = await statusRes.json().catch(() => null);
      const rewardsBody = await rewardsRes.json().catch(() => null);
      if (!active) return;
      const parsed = statusRes.ok ? parseStatus(statusBody) : null;
      setStatus(parsed);
      setRewards(rewardsRes.ok ? asRewards(rewardsBody?.rewards).filter((row) => !row.isSynthetic) : []);
      setFailed(!parsed);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const confirmWelcomeOffer = async (offerId: string) => {
    setSelecting(true);
    setSelectionError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setSelectionError('Inicia sesión de nuevo');
        return;
      }
      const res = await fetch('/api/me/rewards/welcome-offer', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSelectionError(typeof body?.error === 'string' ? body.error : 'No se pudo confirmar la recompensa');
        return;
      }
      setReloadKey((value) => value + 1);
    } finally {
      setSelecting(false);
    }
  };

  const progress = status?.progress;
  const policy = status?.policy;
  const balances = status?.balances;
  const sharePct = policy ? Math.round(policy.creatorShareBps / 100) : 0;
  const minLabel = policy ? money(policy.minPayoutCents) : '—';
  const programStatus = status
    ? resolveRewardsProgramStatus({ programActive: status.programActive, moneyPathFrozen: status.moneyPathFrozen })
    : null;
  const canPay = Boolean(status?.programActive && !status.moneyPathFrozen && status.beta.payoutEnabled);
  const showMoney = Boolean(status?.beta.canSeeEconomics);
  const offersPct = progress ? clampPct(progress.approvedOffers, progress.requiredOffers) : 0;
  const votesPct = progress ? clampPct(progress.positiveVotes, progress.requiredVotes) : 0;
  const missingOffers = progress ? Math.max(0, progress.requiredOffers - progress.approvedOffers) : 0;
  const missingVotes = progress ? Math.max(0, progress.requiredVotes - progress.positiveVotes) : 0;
  const available = balances?.availableCents ?? 0;
  const payoutPct = policy ? clampPct(available, policy.minPayoutCents) : 0;
  const missingPayout = policy ? Math.max(0, policy.minPayoutCents - available) : 0;
  const realRewards = rewards;
  const counts = {
    available: realRewards.filter((row) => row.uiStatus === 'available').length,
    validating: realRewards.filter((row) => row.uiStatus === 'validating' && row.status !== 'PENDING').length,
    pending: realRewards.filter((row) => row.status === 'PENDING').length,
    paid: realRewards.filter((row) => row.uiStatus === 'delivered').length,
    reversed: realRewards.filter((row) => row.uiStatus === 'cancelled').length,
  };
  const howSteps = policy
    ? [
        { title: 'Caza', body: 'Encuentra ofertas realmente buenas.' },
        { title: 'Publica', body: 'Compártelas con la comunidad.' },
        { title: 'Genera valor', body: 'Tu oferta recibe clics y puede generar compras.' },
        { title: 'Aventa recibe comisión', body: 'La tienda paga una comisión de afiliado.' },
        { title: 'Se atribuye la conversión', body: 'Verificamos que la comisión corresponde a tu oferta.' },
        { title: 'Recibes tu parte', body: `El creador recibe el ${sharePct}% de la comisión atribuida.` },
        { title: 'Período de validación', body: `Las recompensas se validan por ${policy.holdDays} días.` },
        { title: 'Cobras', body: canPay ? `Cuando alcanzas el mínimo de ${minLabel} por SPEI.` : `El mínimo de la política es ${minLabel}. Hoy no se puede pagar.` },
      ]
    : [];

  return (
    <MeSpaceShell wide eyebrow="Recompensas" mark={<Gift className="h-3.5 w-3.5" aria-hidden />} title="Recompensas" hideHeading>
      {loading ? <p className="text-sm text-[var(--me-muted)]">Cargando recompensas…</p> : null}
      {!loading && failed ? (
        <section className={`${meCardClass} p-6`}>
          <p className="text-[17px] font-medium">No se pudo cargar el programa de recompensas.</p>
        </section>
      ) : null}
      {!loading && status?.beta.needsOnboarding ? (
        <RewardsBetaOnboarding steps={status.beta.steps} onDone={() => setReloadKey((value) => value + 1)} />
      ) : null}
      {!loading && status && !status.beta.needsOnboarding ? (
        <div className="space-y-5">
          <section className="overflow-hidden rounded-[28px] bg-linear-to-br from-[#6d4aff] via-[#8b5cf6] to-[#c084fc] p-5 text-white shadow-[0_18px_50px_rgba(109,74,255,0.28)] sm:p-7">
            <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1.1fr)_220px_minmax(220px,280px)]">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/80">Tu actividad genera oportunidades</p>
                <h1 className="mt-3 max-w-xl text-[32px] font-semibold leading-[1.12] tracking-tight sm:text-[40px]">
                  Convierte tus descubrimientos en recompensas reales.
                </h1>
                <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-white/90">
                  Cada oferta que compartes puede generar comisiones de afiliado. Tú recibes el {sharePct}% de la comisión atribuida.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <a href="#como-funcionan" className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-[14px] font-semibold text-violet-700">
                    Conoce cómo funciona
                  </a>
                  <Link href="/me/ofertas" className="inline-flex min-h-11 items-center rounded-full border border-white/40 px-4 text-[14px] font-semibold text-white">
                    Ver mis ofertas
                  </Link>
                </div>
              </div>
              <GiftCluster />
              <ul className="space-y-2.5">
                {[
                  { icon: BadgePercent, title: `${sharePct}% para el creador`, body: 'sobre la comisión atribuida' },
                  { icon: Wallet, title: `Pagos a partir de ${minLabel}`, body: 'por SPEI' },
                  { icon: Clock, title: `Validación de ${policy?.holdDays ?? 0} días`, body: 'contra devoluciones' },
                  { icon: ShieldCheck, title: 'Solo compras reales', body: 'con atribución confiable' },
                ].map((fact) => {
                  const Icon = fact.icon;
                  return (
                    <li key={fact.title} className="flex items-center gap-3 rounded-2xl bg-white/15 px-3 py-2.5 backdrop-blur-sm">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold leading-tight">{fact.title}</span>
                        <span className="block text-[12px] text-white/80">{fact.body}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <section className={`${meCardClass} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[18px] font-semibold">Tu camino hacia el programa de recompensas</h2>
                <p className="mt-1 max-w-2xl text-[14px] leading-relaxed text-[var(--me-muted)]">
                  Necesitas cumplir ambos requisitos para desbloquear el programa y elegir tu Oferta de Bienvenida.
                </p>
              </div>
              <Link href="/me/programa" className="text-[13px] font-semibold text-violet-700 dark:text-violet-300">
                Ver requisitos completos
              </Link>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-[#f6f4fb] p-4 dark:bg-white/5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px] font-semibold">Ofertas aprobadas</p>
                  <p className="text-[14px] font-semibold tabular-nums">{progress?.approvedOffers ?? 0} / {progress?.requiredOffers ?? 0}</p>
                </div>
                <p className="mt-1 text-[13px] text-[var(--me-muted)]">Publica ofertas que sean aprobadas por el equipo.</p>
                <Bar value={offersPct} label="Ofertas aprobadas" />
              </div>
              <div className="rounded-2xl bg-[#f6f4fb] p-4 dark:bg-white/5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px] font-semibold">Votos positivos</p>
                  <p className="text-[14px] font-semibold tabular-nums">{progress?.positiveVotes ?? 0} / {progress?.requiredVotes ?? 0}</p>
                </div>
                <p className="mt-1 text-[13px] text-[var(--me-muted)]">Recibe votos positivos en tus ofertas.</p>
                <Bar value={votesPct} label="Votos positivos" />
              </div>
            </div>
            <p className="mt-4 text-[13px] text-[var(--me-muted)]">
              {missingOffers === 0 && missingVotes === 0
                ? 'Ya cumpliste los requisitos para desbloquear el programa de recompensas.'
                : `Te faltan ${missingOffers} ofertas aprobadas y ${missingVotes} votos positivos para desbloquear el programa de recompensas.`}
            </p>
          </section>

          <section className={`${meCardClass} p-5 sm:p-6`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[18px] font-semibold">Tu primera recompensa, paso a paso</h2>
              <span className="text-[12px] font-medium text-[var(--me-muted)]">5 pasos</span>
            </div>
            <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {PATH_STEPS.map((step, index) => {
                const Icon = step.icon;
                const body = index === 3 && progress
                  ? `Cumple ${progress.requiredOffers} ofertas aprobadas + ${progress.requiredVotes} votos positivos.`
                  : index === 4 && progress
                    ? `Selecciona una de tus primeras ${progress.requiredOffers} ofertas aprobadas.`
                    : step.body;
                return (
                  <li key={step.title} className="min-w-0">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-[13px] font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">{index + 1}</span>
                    <span className="mt-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#f6f4fb] text-violet-700 dark:bg-white/5 dark:text-violet-200">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <p className="mt-3 text-[14px] font-semibold">{step.title}</p>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--me-muted)]">{body}</p>
                  </li>
                );
              })}
            </ol>
          </section>

          <section className={`${meCardClass} p-5 sm:p-6`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[18px] font-semibold">Tu Oferta de Bienvenida</h2>
                  {progress?.unlocked ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Disponible</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-[12px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                      <Lock className="h-3 w-3" aria-hidden />
                      Bloqueada
                    </span>
                  )}
                </div>
                <p className="mt-2 text-[14px] leading-relaxed text-[var(--me-muted)]">
                  Cuando cumplas los requisitos, podrás elegir 1 de tus primeras {progress?.requiredOffers ?? 0} ofertas aprobadas como tu Oferta de Bienvenida. Después, tus nuevas ofertas también podrán generar recompensas.
                </p>
              </div>
              <div className="max-w-xs rounded-2xl bg-[#f6f4fb] p-4 dark:bg-white/5">
                <p className="text-[14px] font-semibold">¿Por qué elegir una?</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[var(--me-muted)]">
                  Tu Oferta de Bienvenida es el inicio de tu trayectoria en el programa de recompensas. Marca el punto de partida de tus primeras ofertas aprobadas.
                </p>
              </div>
            </div>

            {status.welcome.needsSelection ? (
              <div className="mt-5">
                <RewardsOfferSelection
                  choices={status.welcome.choices}
                  confirming={selecting}
                  error={selectionError}
                  onConfirm={confirmWelcomeOffer}
                />
              </div>
            ) : status.welcome.welcomeOffer ? (
              <article className="mt-5 flex max-w-sm items-center gap-3 rounded-2xl border border-[var(--me-line)] p-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f6f4fb] dark:bg-white/5">
                  {status.welcome.welcomeOffer.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={status.welcome.welcomeOffer.image_url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[12px] text-[var(--me-muted)]">{status.welcome.welcomeOffer.store?.trim() || 'Tienda'}</p>
                  <p className="line-clamp-2 text-[14px] font-semibold">{status.welcome.welcomeOffer.title}</p>
                </div>
              </article>
            ) : (
              <div className="mt-5 min-w-0">
                <ul className="flex gap-3 overflow-x-auto pb-1">
                  {Array.from({ length: 5 }, (_, index) => (
                    <li key={index} className="relative w-44 shrink-0 overflow-hidden rounded-2xl border border-[var(--me-line)] bg-[var(--me-card)]">
                      <div className="flex h-28 items-center justify-center bg-[#f6f4fb] text-violet-400 dark:bg-white/5">
                        <Gift className="h-8 w-8" aria-hidden />
                      </div>
                      <div className="space-y-2 p-3">
                        <div className="h-2 w-16 rounded-full bg-[#ece8f6] dark:bg-white/10" />
                        <div className="h-2 w-full rounded-full bg-[#ece8f6] dark:bg-white/10" />
                        <div className="h-2 w-20 rounded-full bg-[#ece8f6] dark:bg-white/10" />
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center bg-white/55 dark:bg-black/45">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-violet-700 shadow-sm dark:bg-[#1d1d1f] dark:text-white">
                          <Lock className="h-4 w-4" aria-hidden />
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[13px] text-[var(--me-muted)]">Tus ofertas elegibles aparecen aquí cuando puedas elegir. Hasta entonces esta selección sigue bloqueada.</p>
              </div>
            )}
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
            <section className={`${meCardClass} p-5 sm:p-6`}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[18px] font-semibold">Tus recompensas</h2>
                <a href="#actividad" className="text-[13px] font-semibold text-violet-700 dark:text-violet-300">Ver historial</a>
              </div>
              <p className="mt-1 text-[13px] text-[var(--me-muted)]">Recompensas generadas por compras reales atribuidas a tus ofertas. Tu parte es el {sharePct}% de la comisión atribuida.</p>
              {showMoney ? (
                <>
                  <p className="mt-4 text-[40px] font-semibold tabular-nums leading-none">{money(available)}</p>
                  <Bar value={payoutPct} label="Progreso hacia el mínimo de pago" />
                  <p className="mt-2 text-[13px] text-[var(--me-muted)]">
                    {money(available)} / {minLabel}
                    {missingPayout > 0 ? ` · Te faltan ${money(missingPayout)} para alcanzar el mínimo de pago.` : ' · Ya alcanzaste el mínimo de pago.'}
                  </p>
                </>
              ) : (
                <p className="mt-4 text-[15px] leading-relaxed text-[var(--me-muted)]">Todavía no hay montos de recompensa para mostrar en tu cuenta.</p>
              )}
              {programStatus && programStatus !== 'ACTIVE' ? (
                <p className="mt-3 text-[13px] leading-relaxed text-[var(--me-muted)]">
                  {PROGRAM_STATUS_COPY[programStatus].label}. {PROGRAM_STATUS_COPY[programStatus].description}
                </p>
              ) : null}
              {canPay ? null : <p className="mt-2 text-[13px] font-medium text-[var(--me-ink)]">Esto todavía no puede pagarse.</p>}
            </section>

            <section className={`${meCardClass} p-5 sm:p-6`}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[18px] font-semibold">Estado del programa</h2>
                {progress?.unlocked ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">Desbloqueado</span>
                ) : (
                  <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[12px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">Aún no desbloqueado</span>
                )}
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f6f4fb] px-4 py-3 dark:bg-white/5">
                  <span className="text-[14px]">Ofertas aprobadas</span>
                  <span className="font-semibold tabular-nums">{progress?.approvedOffers ?? 0} / {progress?.requiredOffers ?? 0}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f6f4fb] px-4 py-3 dark:bg-white/5">
                  <span className="text-[14px]">Votos positivos</span>
                  <span className="font-semibold tabular-nums">{progress?.positiveVotes ?? 0} / {progress?.requiredVotes ?? 0}</span>
                </div>
              </div>
              <Link href="/me/nivel" className="mt-4 inline-flex text-[13px] font-semibold text-violet-700 dark:text-violet-300">
                Ver mi actividad
              </Link>
            </section>
          </div>

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'Disponibles', value: counts.available, hint: canPay ? 'Listas para pago' : 'Aún no se pueden pagar' },
              { label: 'En validación', value: counts.validating, hint: `Revisión (hasta ${policy?.holdDays ?? 0} días)` },
              { label: 'Pendientes', value: counts.pending, hint: 'Detectadas recientemente' },
              { label: 'Pagadas', value: counts.paid, hint: 'Historial de pagos' },
              { label: 'Revertidas', value: counts.reversed, hint: 'Canceladas o no válidas' },
            ].map((item) => (
              <article key={item.label} className={`${meCardClass} min-w-0 p-4`}>
                <p className="text-[28px] font-semibold tabular-nums leading-none">{item.value}</p>
                <p className="mt-2 text-[14px] font-semibold">{item.label}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[var(--me-muted)]">{item.hint}</p>
              </article>
            ))}
          </section>

          <section id="actividad" className={`${meCardClass} min-w-0 scroll-mt-24 p-5 sm:p-6`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-semibold">Actividad reciente</h2>
                <p className="mt-1 text-[13px] text-[var(--me-muted)]">Recompensas generadas por tus ofertas.</p>
              </div>
            </div>
            {realRewards.length === 0 ? (
              <p className="mt-4 text-[14px] text-[var(--me-muted)]">Cuando el programa registre una recompensa, aparecerá aquí.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[13px]">
                  <thead className="text-[var(--me-muted)]">
                    <tr>
                      <th className="pb-2 font-medium">Fecha</th>
                      <th className="pb-2 font-medium">Oferta</th>
                      <th className="pb-2 font-medium">Tienda</th>
                      <th className="pb-2 font-medium">Tu parte</th>
                      <th className="pb-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {realRewards.map((row) => (
                      <tr key={row.id} className="border-t border-[var(--me-line)]">
                        <td className="py-3 pr-3 whitespace-nowrap">{formatDay(row.paidAt ?? row.createdAt)}</td>
                        <td className="py-3 pr-3">
                          <span className="line-clamp-2 font-medium">{row.offer?.title ?? 'Oferta'}</span>
                        </td>
                        <td className="py-3 pr-3">{row.offer?.store?.trim() || '—'}</td>
                        <td className="py-3 pr-3 tabular-nums">{showMoney ? formatRewardShare(row.shareCents, row.currency) ?? '—' : '—'}</td>
                        <td className="py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${statusTone(row)}`}>{row.statusLabel || 'En validación'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section id="como-funcionan" className={`${meCardClass} scroll-mt-24 p-5 sm:p-6`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[18px] font-semibold">Cómo funcionan las recompensas</h2>
              <Link href="/me/programa" className="text-[13px] font-semibold text-violet-700 dark:text-violet-300">Ver guía completa</Link>
            </div>
            <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {howSteps.map((step, index) => (
                <li key={step.title} className="min-w-0">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-[13px] font-semibold text-white">{index + 1}</span>
                  <p className="mt-3 text-[14px] font-semibold">{step.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--me-muted)]">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      ) : null}
    </MeSpaceShell>
  );
}
