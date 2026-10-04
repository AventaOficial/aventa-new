import { useId, type ReactNode } from 'react';
import type { AchievementCategory, AchievementRarity } from '@/lib/achievements/types';
import { CATEGORY_TONE, MYTHIC_STOPS, RARITY_TIER, achievementDefinition } from './achievementVisuals';

/**
 * Sello de logro de Aventa.
 * Geometría fija: hexágono de punta (pieza coleccionable) + bisel interior + glifo de la familia.
 * La familia decide tono y glifo; la rareza decide el marco (remaches en los vértices, halo, mítico tricolor).
 * Bloqueado: pieza sin tinta, contorno punteado, candado y el progreso real recorriendo el marco.
 */

export type AchievementSigilState = 'unlocked' | 'locked' | 'concealed';
export type AchievementSigilSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_PX: Record<AchievementSigilSize, number> = { xs: 24, sm: 36, md: 56, lg: 96 };

const FRAME = 'M32 6 L54.5 19 V45 L32 58 L9.5 45 V19 Z';
const BEVEL = 'M32 12 L49.3 22 V42 L32 52 L14.7 42 V22 Z';
const HALO = 'M32 1.8 L58.2 16.9 V47.1 L32 62.2 L5.8 47.1 V16.9 Z';
const VERTICES: ReadonlyArray<readonly [number, number]> = [
  [32, 6],
  [54.5, 19],
  [54.5, 45],
  [32, 58],
  [9.5, 45],
  [9.5, 19],
];
const STUDS_BY_TIER: Record<number, number[]> = {
  0: [],
  1: [0, 3],
  2: [0, 2, 4],
  3: [0, 1, 2, 3, 4, 5],
  4: [0, 1, 2, 3, 4, 5],
  5: [0, 1, 2, 3, 4, 5],
};

type GlyphProps = { color: string };

const GLYPHS: Record<AchievementCategory | 'concealed', (props: GlyphProps) => ReactNode> = {
  caceria: ({ color }) => (
    <g fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 19c3.5-.8 5.6-3 7.2-6.2 1.5-3 3.6-5.3 7.8-6.3" strokeDasharray="0.1 3.6" />
      <path d="M15.6 5.2l4.2 1.3-1.6 4" />
      <circle cx={4.5} cy={19} r={1.6} fill={color} stroke="none" />
    </g>
  ),
  precision: ({ color }) => (
    <g fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <circle cx={12} cy={12} r={6.5} />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
      <circle cx={12} cy={12} r={1.7} fill={color} stroke="none" />
    </g>
  ),
  comunidad: ({ color }) => (
    <g fill="none" stroke={color} strokeWidth={2.2}>
      <circle cx={9} cy={12} r={5.5} />
      <circle cx={15} cy={12} r={5.5} />
    </g>
  ),
  constancia: ({ color }) => (
    <g fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 19.5h4.2v-4.6h4.4v-4.6h4.4V5.7h4" />
      <circle cx={20.5} cy={5.7} r={1.6} fill={color} stroke="none" />
    </g>
  ),
  impacto: ({ color }) => (
    <g fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <circle cx={5.5} cy={18.5} r={1.9} fill={color} stroke="none" />
      <path d="M5.5 12.5a6 6 0 0 1 6 6" />
      <path d="M5.5 6.5a12 12 0 0 1 12 12" />
    </g>
  ),
  experiencia: ({ color }) => (
    <g fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9.5l6-4.5 6 4.5" />
      <path d="M6 14.5l6-4.5 6 4.5" opacity={0.8} />
      <path d="M6 19.5l6-4.5 6 4.5" opacity={0.6} />
    </g>
  ),
  especiales: ({ color }) => (
    <path d="M12 2.8l2.3 6.9 6.9 2.3-6.9 2.3L12 21.2l-2.3-6.9L2.8 12l6.9-2.3z" fill={color} />
  ),
  concealed: ({ color }) => (
    <g fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <path d="M9.2 9.2a2.8 2.8 0 1 1 4 2.5c-.8.4-1.2 1-1.2 1.9v.6" />
      <circle cx={12} cy={17.6} r={1.3} fill={color} stroke="none" />
    </g>
  ),
};

export default function AchievementSigil({
  code,
  category,
  rarity,
  state = 'unlocked',
  percent = 0,
  size = 'md',
  label,
}: {
  code?: string | null;
  category?: AchievementCategory;
  rarity?: AchievementRarity;
  state?: AchievementSigilState;
  /** Progreso real (0–100) que ya entrega el backend. Solo se dibuja en bloqueados. */
  percent?: number;
  size?: AchievementSigilSize;
  /** Si se omite, el sello es decorativo (el nombre ya está en texto al lado). */
  label?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const definition = achievementDefinition(code);
  const family = category ?? definition?.category ?? 'caceria';
  const tier = RARITY_TIER[rarity ?? definition?.rarity ?? 'common'];
  const tone = CATEGORY_TONE[family];
  const px = SIZE_PX[size];
  const unlocked = state === 'unlocked';
  const concealed = state === 'concealed';
  const mythic = tier === 5;
  const fillId = `sigil-fill-${uid}`;
  const shineId = `sigil-shine-${uid}`;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const showProgress = state === 'locked' && clamped > 0 && size !== 'xs';
  const Glyph = GLYPHS[concealed ? 'concealed' : family];
  const glyphColor = unlocked ? '#ffffff' : concealed ? '#a1a1aa' : tone.ink;

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 64 64"
      className="shrink-0 overflow-visible"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="1" y2="1">
          {mythic ? (
            <>
              <stop offset="0%" stopColor={MYTHIC_STOPS[0]} />
              <stop offset="55%" stopColor={MYTHIC_STOPS[1]} />
              <stop offset="100%" stopColor={MYTHIC_STOPS[2]} />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor={tone.from} />
              <stop offset="100%" stopColor={tone.to} />
            </>
          )}
        </linearGradient>
        <linearGradient id={shineId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.38} />
          <stop offset="60%" stopColor="#ffffff" stopOpacity={0} />
        </linearGradient>
      </defs>

      {unlocked && tier >= 4 ? (
        <path d={HALO} fill="none" stroke={`url(#${fillId})`} strokeWidth={1.4} strokeLinejoin="round" opacity={0.55} />
      ) : null}

      {unlocked ? (
        <>
          <path d={FRAME} fill={`url(#${fillId})`} stroke={`url(#${fillId})`} strokeWidth={3} strokeLinejoin="round" />
          <path d={FRAME} fill={`url(#${shineId})`} strokeLinejoin="round" />
          <path d={BEVEL} fill="none" stroke="#ffffff" strokeOpacity={tier >= 1 ? 0.45 : 0.28} strokeWidth={1.3} strokeLinejoin="round" />
        </>
      ) : (
        <>
          <path
            d={FRAME}
            className="fill-white dark:fill-[#1c1c1e]"
            stroke={concealed ? '#a1a1aa' : tone.ink}
            strokeOpacity={0.45}
            strokeWidth={2}
            strokeDasharray="3.5 3"
            strokeLinejoin="round"
          />
          <path d={BEVEL} fill={concealed ? '#a1a1aa' : tone.ink} fillOpacity={0.07} />
        </>
      )}

      {showProgress ? (
        <path
          d={FRAME}
          fill="none"
          stroke={tone.ink}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={100}
          strokeDasharray={`${clamped} 100`}
        />
      ) : null}

      {!concealed
        ? STUDS_BY_TIER[tier].map((index) => {
            const [cx, cy] = VERTICES[index];
            return (
              <circle
                key={index}
                cx={cx}
                cy={cy}
                r={2.3}
                fill={unlocked ? '#ffffff' : tone.ink}
                fillOpacity={unlocked ? 0.95 : 0.4}
                stroke={unlocked ? tone.to : 'none'}
                strokeWidth={unlocked ? 0.8 : 0}
              />
            );
          })
        : null}

      <g transform="translate(20 20)" opacity={unlocked ? 1 : 0.7}>
        <Glyph color={glyphColor} />
      </g>

      {mythic && unlocked ? (
        <path d="M49 9.5l1.1 3.1 3.1 1.1-3.1 1.1-1.1 3.1-1.1-3.1-3.1-1.1 3.1-1.1z" fill="#ffffff" />
      ) : null}

      {state === 'locked' && size !== 'xs' ? (
        <g>
          <circle cx={50} cy={50} r={8.5} className="fill-[#1d1d1f] dark:fill-[#f5f5f7]" />
          <path d="M47.8 49.4v-1.5a2.2 2.2 0 0 1 4.4 0v1.5" fill="none" className="stroke-white dark:stroke-[#1d1d1f]" strokeWidth={1.5} strokeLinecap="round" />
          <rect x={46.6} y={49.2} width={6.8} height={5.2} rx={1.1} className="fill-white dark:fill-[#1d1d1f]" />
        </g>
      ) : null}
    </svg>
  );
}
