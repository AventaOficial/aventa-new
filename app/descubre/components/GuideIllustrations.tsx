'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { IllustrationId } from '../guides/content';

const EASE = [0.22, 1, 0.36, 1] as const;

function Scene({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto flex h-44 w-full max-w-sm items-center justify-center sm:h-48">
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/10 via-fuchsia-500/5 to-transparent dark:from-violet-500/15 dark:via-fuchsia-500/10 ring-1 ring-inset ring-violet-500/15" />
      <div className="relative z-10 w-full px-6">{children}</div>
    </div>
  );
}

function FeedTabsDemo() {
  const tabs = ['Día a día', 'Top', 'Para ti', 'Recientes'];
  return (
    <Scene>
      <div className="flex flex-wrap justify-center gap-1.5">
        {tabs.map((tab, i) => (
          <motion.span
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08, duration: 0.35, ease: EASE }}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              i === 2
                ? 'bg-violet-600 text-white shadow-md shadow-violet-500/30'
                : 'bg-white/80 text-gray-600 dark:bg-gray-800/80 dark:text-gray-300'
            }`}
          >
            {tab}
          </motion.span>
        ))}
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.35, duration: 0.4, ease: EASE }}
        className="mt-4 space-y-2"
      >
        {[0, 1].map((i) => (
          <div key={i} className="flex gap-2 rounded-xl bg-white/90 p-2 shadow-sm dark:bg-gray-900/90">
            <div className="h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br from-violet-200 to-fuchsia-200 dark:from-violet-900 dark:to-fuchsia-900" />
            <div className="flex-1 space-y-1.5 py-0.5">
              <div className="h-2 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-2 w-1/3 rounded bg-violet-200 dark:bg-violet-800" />
            </div>
          </div>
        ))}
      </motion.div>
    </Scene>
  );
}

function VoteDemo() {
  return (
    <Scene>
      <div className="flex items-center justify-center gap-6">
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 ring-2 ring-emerald-500/30 dark:text-emerald-400"
          aria-hidden
        >
          <ArrowUp className="h-7 w-7" strokeWidth={2.5} />
        </motion.div>
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: [0.95, 1.02, 0.95] }}
          transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}
          className="rounded-xl bg-white/90 px-4 py-3 text-center shadow-md dark:bg-gray-900/90"
        >
          <p className="text-xs font-bold text-gray-800 dark:text-gray-100">$899</p>
          <p className="text-[10px] text-gray-500 line-through">$1,199</p>
        </motion.div>
        <motion.div
          animate={{ y: [0, 4, 0] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut', delay: 0.3 }}
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-red-500 ring-2 ring-red-500/20"
          aria-hidden
        >
          <ArrowDown className="h-7 w-7" strokeWidth={2.5} />
        </motion.div>
      </div>
    </Scene>
  );
}

function UploadDemo() {
  const fields = ['Enlace pegado ✓', 'Título', 'Precio', 'Categoría'];
  return (
    <Scene>
      <div className="space-y-2">
        {fields.map((f, i) => (
          <motion.div
            key={f}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1, duration: 0.35, ease: EASE }}
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              i === 0
                ? 'border-emerald-400/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-gray-200 bg-white/90 text-gray-500 dark:border-gray-700 dark:bg-gray-900/90'
            }`}
          >
            {f}
          </motion.div>
        ))}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-2 rounded-lg bg-violet-600 py-2 text-center text-xs font-bold text-white"
        >
          Publicar oferta
        </motion.div>
      </div>
    </Scene>
  );
}

function CommissionDemo() {
  return (
    <Scene>
      <div className="flex items-end justify-center gap-3">
        {[40, 70, 55, 90, 65].map((h, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: h }}
            transition={{ delay: i * 0.08, duration: 0.5, ease: EASE }}
            className="w-8 rounded-t-lg bg-gradient-to-t from-violet-600 to-fuchsia-500 opacity-90"
          />
        ))}
      </div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-3 text-center text-xs font-semibold text-violet-700 dark:text-violet-300"
      >
        Impacto → reparto mensual
      </motion.p>
    </Scene>
  );
}

function CommunityDemo() {
  return (
    <Scene>
      <div className="relative flex h-28 items-center justify-center">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="absolute h-10 w-10 rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-500 ring-2 ring-white dark:ring-gray-900"
            style={{
              left: `${20 + i * 14}%`,
              top: `${30 + (i % 2) * 20}%`,
            }}
            animate={{ y: [0, -6, 0] }}
            transition={{ repeat: Infinity, duration: 2 + i * 0.2, ease: 'easeInOut', delay: i * 0.15 }}
          />
        ))}
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          className="z-10 rounded-2xl bg-white/95 px-4 py-2 text-center shadow-lg dark:bg-gray-900/95"
        >
          <p className="text-[11px] font-bold text-violet-700 dark:text-violet-300">Oferta top</p>
          <p className="text-[10px] text-gray-500">+847 votos</p>
        </motion.div>
      </div>
    </Scene>
  );
}

function HeartDemo() {
  return (
    <Scene>
      <motion.div
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-violet-600 shadow-lg shadow-violet-500/30"
      >
        <svg className="h-8 w-8 fill-white text-white" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
      </motion.div>
      <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">Guardada en favoritos</p>
    </Scene>
  );
}

function GenericIconDemo({ emoji }: { emoji: string }) {
  return (
    <Scene>
      <motion.span
        animate={{ rotate: [0, 5, -5, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
        className="mx-auto block text-5xl"
        role="img"
        aria-hidden
      >
        {emoji}
      </motion.span>
    </Scene>
  );
}

const ILLUSTRATION_MAP: Record<IllustrationId, ReactNode> = {
  community: <CommunityDemo />,
  'feed-tabs': <FeedTabsDemo />,
  vote: <VoteDemo />,
  favorites: <HeartDemo />,
  personalized: <FeedTabsDemo />,
  comments: <GenericIconDemo emoji="💬" />,
  profile: <GenericIconDemo emoji="👤" />,
  settings: <GenericIconDemo emoji="⚙️" />,
  notifications: <GenericIconDemo emoji="🔔" />,
  'hunter-intro': <GenericIconDemo emoji="🏹" />,
  'upload-flow': <UploadDemo />,
  moderation: <GenericIconDemo emoji="🛡️" />,
  commissions: <CommissionDemo />,
  reputation: <GenericIconDemo emoji="📈" />,
  'hunter-tips': <GenericIconDemo emoji="✨" />,
  'saver-intro': <GenericIconDemo emoji="🛒" />,
  'browse-feed': <FeedTabsDemo />,
  filters: <GenericIconDemo emoji="🔍" />,
  'saver-favorites': <HeartDemo />,
  'saver-digest': <GenericIconDemo emoji="📧" />,
  'saver-vote': <VoteDemo />,
};

export default function GuideIllustration({ id }: { id: IllustrationId }) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      {ILLUSTRATION_MAP[id]}
    </motion.div>
  );
}
