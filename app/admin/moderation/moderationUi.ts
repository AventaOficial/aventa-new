import type { ModerationHubMode } from '@/lib/moderation/hubConfig';

/** Tokens de superficie para admin (oscuro) vs workspace equipo (claro). */
export function moderationUi(mode: ModerationHubMode = 'admin') {
  const ws = mode === 'workspace';
  return {
    ws,
    card: ws
      ? 'rounded-2xl glass-light border border-black/[0.06] shadow-sm dark:glass-dark dark:border-white/[0.08]'
      : 'rounded-2xl glass-dark',
    title: ws ? 'text-gray-900 dark:text-white/90' : 'text-white/90',
    subtitle: ws ? 'text-gray-600 dark:text-white/45' : 'text-white/45',
    muted: ws ? 'text-gray-500 dark:text-white/40' : 'text-white/40',
    faint: ws ? 'text-gray-400 dark:text-white/30' : 'text-white/30',
    label: ws ? 'text-gray-500 dark:text-white/40' : 'text-white/40',
    body: ws ? 'text-gray-800 dark:text-white/85' : 'text-white/85',
    soft: ws ? 'text-gray-600 dark:text-white/55' : 'text-white/55',
    border: ws ? 'border-black/[0.06] dark:border-white/[0.08]' : 'border-white/[0.06]',
    borderStrong: ws ? 'border-gray-200 dark:border-white/10' : 'border-white/10',
    hairline: ws ? 'border-gray-100 dark:border-white/[0.06]' : 'border-white/[0.06]',
    chipIdle: ws
      ? 'text-gray-600 hover:bg-black/[0.04] hover:text-gray-900 dark:text-white/45 dark:hover:bg-white/[0.04] dark:hover:text-white/70'
      : 'text-white/45 hover:bg-white/[0.04] hover:text-white/70',
    chipActive: ws
      ? 'bg-emerald-600 text-white dark:bg-white/[0.08] dark:text-white'
      : 'bg-white/[0.08] text-white',
    rowHover: ws ? 'hover:bg-black/[0.03] dark:hover:bg-white/[0.03]' : 'hover:bg-white/[0.03]',
    rowActive: ws
      ? 'border-emerald-400/50 bg-emerald-50 dark:border-violet-400/40 dark:bg-violet-500/10'
      : 'border-violet-400/40 bg-violet-500/10',
    thumbBg: ws ? 'bg-gray-100 dark:bg-white/[0.06]' : 'bg-white/[0.06]',
    input: ws
      ? 'rounded-xl border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-violet-400/40 dark:focus:ring-0'
      : 'rounded-xl border border-white/10 bg-white/[0.04] text-white/90 placeholder:text-white/30 outline-none focus:border-violet-400/40',
    select: ws
      ? 'rounded-xl border border-gray-200 bg-white text-sm text-gray-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/85'
      : 'rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white/85',
    btnGhost: ws
      ? 'rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/[0.04]'
      : 'rounded-full border border-white/10 px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/[0.04]',
    btnGhostSm: ws
      ? 'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/[0.04]'
      : 'inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:bg-white/[0.04]',
    iconMuted: ws ? 'text-gray-400 dark:text-white/35' : 'text-white/35',
    iconSoft: ws ? 'text-gray-500 dark:text-white/40' : 'text-white/40',
    stickyBar: ws
      ? 'border-t border-gray-100 bg-gray-50/90 dark:border-white/[0.06] dark:bg-black/20'
      : 'border-t border-white/[0.06] bg-black/20',
    heroBg: ws ? 'bg-gray-50 dark:bg-white/[0.04]' : 'bg-white/[0.04]',
    /** Modales y hojas: fondo sólido, nunca cristal (ver .sheet-* en globals.css). */
    modal: ws ? 'rounded-2xl sheet-workspace' : 'rounded-2xl sheet-owner',
    emptyDash: ws
      ? 'rounded-2xl border border-dashed border-gray-200 py-16 text-gray-500 dark:border-white/10 dark:text-white/45'
      : 'rounded-2xl border border-dashed border-white/10 py-16 text-white/45',
  };
}

export type ModerationUi = ReturnType<typeof moderationUi>;
