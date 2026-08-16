'use client';

import { motion } from 'framer-motion';
import { ArrowRight, Check, Trophy } from 'lucide-react';
import { GUIDES, type GuideId, type GuideTheme } from '../guides/content';
import {
  completedGuideCount,
  stepsSeen,
  totalGuideSteps,
  type GuideProgressMap,
} from '@/lib/guides/guideProgress';

const EASE = [0.22, 1, 0.36, 1] as const;

const HUB: Record<
  GuideId,
  { label: string; heading: string; description: string; minutes: number }
> = {
  aventa: {
    label: 'EMPIEZA AQUÍ',
    heading: 'Conoce Aventa',
    description:
      'Descubre el feed, votos, favoritos, perfiles, configuración y todo lo esencial para empezar.',
    minutes: 5,
  },
  cazador: {
    label: 'SUBE, IMPACTA Y GANA',
    heading: 'Conviértete en Cazador',
    description:
      'Aprende a encontrar ofertas, publicarlas, pasar moderación, ganar reputación y desbloquear recompensas.',
    minutes: 4,
  },
  ahorrador: {
    label: 'ENCUENTRA SIN COMPLICARTE',
    heading: 'Aprende a ahorrar',
    description:
      'Domina filtros, favoritos, alertas y las herramientas que te ayudan a no dejar pasar una buena oferta.',
    minutes: 4,
  },
};

const THEME: Record<
  GuideTheme,
  { chip: string; bar: string; cta: string; iconWrap: string; icon: string }
> = {
  violet: {
    chip: 'text-violet-600 dark:text-violet-400',
    bar: 'bg-violet-600',
    cta: 'bg-violet-600 hover:bg-violet-700 text-white',
    iconWrap: 'bg-violet-600/10 text-violet-600 dark:text-violet-400',
    icon: 'text-violet-600 dark:text-violet-400',
  },
  orange: {
    chip: 'text-orange-600 dark:text-orange-400',
    bar: 'bg-orange-500',
    cta: 'bg-orange-500 hover:bg-orange-600 text-white',
    iconWrap: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    icon: 'text-orange-500',
  },
  teal: {
    chip: 'text-emerald-600 dark:text-emerald-400',
    bar: 'bg-emerald-500',
    cta: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    iconWrap: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    icon: 'text-emerald-600 dark:text-emerald-400',
  },
};

function ctaLabel(seen: number, total: number) {
  if (seen >= total && total > 0) return 'Repasar';
  if (seen > 0) return 'Continuar';
  return 'Empezar';
}

function DiscoverArt() {
  return (
    <svg viewBox="0 0 160 120" className="h-full w-full" aria-hidden>
      <circle cx="118" cy="38" r="36" fill="currentColor" className="text-violet-500/15" />
      <circle cx="118" cy="38" r="22" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-violet-400/40" />
      <circle cx="42" cy="86" r="18" fill="currentColor" className="text-fuchsia-400/15" />
      <path
        d="M28 52h44a8 8 0 0 1 8 8v28a8 8 0 0 1-8 8H28a8 8 0 0 1-8-8V60a8 8 0 0 1 8-8z"
        fill="currentColor"
        className="text-white/80 dark:text-white/10"
      />
      <path d="M36 64h28M36 74h18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-violet-400/70" />
      <circle cx="96" cy="78" r="3" fill="currentColor" className="text-violet-500" />
      <circle cx="148" cy="72" r="2.5" fill="currentColor" className="text-fuchsia-500" />
      <path d="M108 18l2.2 5.4 5.8.2-4.6 3.6 1.6 5.6L108 29.6 101 32.8l1.6-5.6-4.6-3.6 5.8-.2z" fill="currentColor" className="text-violet-500/80" />
      <path d="M138 52l1.4 3.4 3.6.1-2.9 2.2 1 3.5-3.1-2.1-3.1 2.1 1-3.5-2.9-2.2 3.6-.1z" fill="currentColor" className="text-violet-400/70" />
    </svg>
  );
}

type Props = {
  onSelect: (id: GuideId) => void;
  progress: GuideProgressMap;
};

export default function GuideHub({ onSelect, progress }: Props) {
  const totalSteps = totalGuideSteps();
  const seenSteps = GUIDES.reduce((sum, g) => sum + stepsSeen(g.id, g.steps.length, progress), 0);
  const pct = totalSteps > 0 ? Math.round((seenSteps / totalSteps) * 100) : 0;
  const doneGuides = completedGuideCount(progress);
  const featured = GUIDES.find((g) => g.id === 'aventa');
  const secondary = GUIDES.filter((g) => g.id !== 'aventa');

  return (
    <div className="mx-auto max-w-[1120px]">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        className="mb-5"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-600 dark:text-violet-400">
          Guías AVENTA
        </p>
        <h1 className="mt-1.5 text-[1.65rem] font-semibold tracking-[-0.04em] text-[#1d1d1f] dark:text-[#fafafa] md:text-[1.85rem]">
          ¿Qué quieres hacer en Aventa?
        </h1>
        <p className="mt-1.5 max-w-xl text-[14px] leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">
          Aprende a encontrar ofertas, cazarlas y aprovechar todo lo que Aventa tiene para ti.
        </p>
      </motion.header>

      <div className="mb-5 rounded-2xl border border-[#e8e8ed] bg-white px-4 py-3.5 dark:border-[#2a2a2a] dark:bg-[#141414]">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Tu progreso en Aventa</p>
          <p className="text-xs font-medium tabular-nums text-[#6e6e73] dark:text-[#a3a3a3]">
            {seenSteps} / {totalSteps} pasos completados
          </p>
        </div>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#e8e8ed] dark:bg-[#2c2c2e]">
          <div className="h-full rounded-full bg-violet-600 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-xs text-[#6e6e73] dark:text-[#a3a3a3]">Completa las guías para dominar Aventa.</p>
      </div>

      {featured ? (
        <FeaturedCard guideId={featured.id} icon={featured.icon} theme={featured.theme} total={featured.steps.length} seen={stepsSeen(featured.id, featured.steps.length, progress)} onSelect={onSelect} />
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {secondary.map((guide, i) => (
          <GuideCard
            key={guide.id}
            guideId={guide.id}
            icon={guide.icon}
            theme={guide.theme}
            total={guide.steps.length}
            seen={stepsSeen(guide.id, guide.steps.length, progress)}
            delay={0.08 + i * 0.06}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-[#e8e8ed] bg-white px-4 py-3.5 dark:border-[#2a2a2a] dark:bg-[#141414]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600/10 text-violet-600 dark:text-violet-400">
          <Trophy className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#1d1d1f] dark:text-[#fafafa]">Completa tus guías</p>
          <p className="text-xs text-[#6e6e73] dark:text-[#a3a3a3]">
            Aprende Aventa, gana progreso y desbloquea beneficios. {doneGuides} de {GUIDES.length} guías completadas
          </p>
        </div>
      </div>
    </div>
  );
}

function FeaturedCard({
  guideId,
  icon: Icon,
  theme,
  total,
  seen,
  onSelect,
}: {
  guideId: GuideId;
  icon: (typeof GUIDES)[number]['icon'];
  theme: GuideTheme;
  total: number;
  seen: number;
  onSelect: (id: GuideId) => void;
}) {
  const copy = HUB[guideId];
  const t = THEME[theme];
  const done = seen >= total && total > 0;
  const ratio = total > 0 ? seen / total : 0;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      whileTap={{ scale: 0.995 }}
      onClick={() => onSelect(guideId)}
      className="relative w-full overflow-hidden rounded-3xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/40 p-5 text-left dark:border-violet-500/20 dark:from-violet-950/40 dark:via-[#141414] dark:to-fuchsia-950/20 md:p-6"
    >
      <div className="pointer-events-none absolute -right-2 -top-4 h-36 w-44 text-violet-600 md:right-2 md:top-0 md:h-40 md:w-52">
        <DiscoverArt />
      </div>
      <div className="relative z-10 max-w-[36rem] pr-24 md:pr-40">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${t.chip}`}>{copy.label}</p>
        <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-[#1d1d1f] dark:text-[#fafafa] md:text-[1.35rem]">
          {copy.heading}
        </h2>
        <p className="mt-1.5 text-sm leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">{copy.description}</p>
        <p className="mt-3 text-xs font-medium text-[#6e6e73] dark:text-[#a3a3a3]">
          {total} pasos · ≈ {copy.minutes} min
          {seen > 0 && !done ? ` · ${seen} / ${total} pasos` : null}
        </p>
        <div className="mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-violet-200/70 dark:bg-violet-900/40">
          <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${Math.max(ratio * 100, seen > 0 ? 8 : 0)}%` }} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          {done ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="h-3.5 w-3.5" aria-hidden />
              Completada
            </span>
          ) : (
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${t.iconWrap}`}>
              <Icon className="h-4 w-4" aria-hidden />
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${t.cta}`}>
            {ctaLabel(seen, total)}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </div>
    </motion.button>
  );
}

function GuideCard({
  guideId,
  icon: Icon,
  theme,
  total,
  seen,
  delay,
  onSelect,
}: {
  guideId: GuideId;
  icon: (typeof GUIDES)[number]['icon'];
  theme: GuideTheme;
  total: number;
  seen: number;
  delay: number;
  onSelect: (id: GuideId) => void;
}) {
  const copy = HUB[guideId];
  const t = THEME[theme];
  const done = seen >= total && total > 0;
  const ratio = total > 0 ? seen / total : 0;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: EASE }}
      whileTap={{ scale: 0.995 }}
      onClick={() => onSelect(guideId)}
      className="flex w-full flex-col rounded-3xl border border-[#e8e8ed] bg-white p-5 text-left dark:border-[#2a2a2a] dark:bg-[#141414]"
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.iconWrap}`}>
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <p className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] ${t.chip}`}>{copy.label}</p>
      <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#1d1d1f] dark:text-[#fafafa]">
        {copy.heading}
      </h2>
      <p className="mt-1.5 text-sm leading-snug text-[#6e6e73] dark:text-[#a3a3a3]">{copy.description}</p>
      <p className="mt-3 text-xs font-medium text-[#6e6e73] dark:text-[#a3a3a3]">
        {total} pasos · ≈ {copy.minutes} min
        {seen > 0 && !done ? ` · ${seen} / ${total} pasos` : null}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e8e8ed] dark:bg-[#2c2c2e]">
        <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${Math.max(ratio * 100, seen > 0 ? 8 : 0)}%` }} />
      </div>
      <div className="mt-4 flex items-center gap-3">
        {done ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5" aria-hidden />
            Completada
          </span>
        ) : null}
        <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${t.cta}`}>
          {ctaLabel(seen, total)}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </motion.button>
  );
}
