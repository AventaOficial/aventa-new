'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown, ArrowUp } from 'lucide-react';

type VoteArrowButtonProps = {
  direction: 'up' | 'down';
  active?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  iconClassName?: string;
  disabled?: boolean;
  'aria-label'?: string;
};

const SHOT_EASE = [0.22, 1, 0.36, 1] as const;
const SHOT_DURATION = 0.72;

function BowShotOverlay({ isUp, shotKey }: { isUp: boolean; shotKey: number }) {
  const bowPath = isUp ? 'M 9 37 Q 24 11 39 37' : 'M 9 11 Q 24 37 39 11';

  return (
    <motion.svg
      key={shotKey}
      viewBox="0 0 48 48"
      className="pointer-events-none absolute -inset-2.5 z-30 h-[calc(100%+20px)] w-[calc(100%+20px)] overflow-visible"
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: SHOT_DURATION, times: [0, 0.12, 0.58, 1], ease: SHOT_EASE }}
    >
      <motion.path
        d={bowPath}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-violet-500/90 dark:text-violet-400/90"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: [0, 1, 1], opacity: [0, 0.95, 0] }}
        transition={{ duration: SHOT_DURATION, times: [0, 0.22, 1], ease: SHOT_EASE }}
      />
      <motion.line
        x1="9"
        y1={isUp ? '37' : '11'}
        x2="39"
        y2={isUp ? '37' : '11'}
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        className="text-violet-400/70 dark:text-violet-300/70"
        initial={{ opacity: 0, scaleX: 0.4 }}
        animate={{ opacity: [0, 0.85, 0.5, 0], scaleX: [0.4, 1, 1.08, 1.12] }}
        transition={{ duration: SHOT_DURATION, times: [0, 0.18, 0.42, 1], ease: SHOT_EASE }}
        style={{ transformOrigin: '24px 24px' }}
      />
      <motion.g
        initial={{
          x: 24,
          y: isUp ? 35 : 13,
          opacity: 0,
          scale: 0.45,
          rotate: isUp ? -90 : 90,
        }}
        animate={{
          x: [24, isUp ? 21 : 27, 24],
          y: isUp ? [35, 21, 7] : [13, 27, 41],
          opacity: [0, 1, 1, 0],
          scale: [0.45, 1, 0.9, 0.3],
          rotate: isUp ? -90 : 90,
        }}
        transition={{ duration: SHOT_DURATION, times: [0, 0.2, 0.65, 1], ease: SHOT_EASE }}
      >
        <polygon
          points="0,-6 5,0 0,6"
          fill="currentColor"
          className="text-violet-600 dark:text-violet-300"
        />
        <rect x="-7" y="-1.2" width="7" height="2.4" rx="0.6" fill="currentColor" className="text-violet-600 dark:text-violet-300" />
      </motion.g>
    </motion.svg>
  );
}

/** Voto con flecha y animación de arco al pulsar. */
export default function VoteArrowButton({
  direction,
  active,
  onClick,
  className = '',
  iconClassName = '',
  disabled,
  'aria-label': ariaLabel,
}: VoteArrowButtonProps) {
  const [shotId, setShotId] = useState(0);
  const isUp = direction === 'up';
  const Icon = isUp ? ArrowUp : ArrowDown;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    setShotId((n) => n + 1);
    onClick(e);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={ariaLabel ?? (isUp ? 'Votar arriba' : 'Votar abajo')}
      aria-pressed={active}
      className={`relative overflow-visible ${className}`}
    >
      <AnimatePresence mode="wait">
        {shotId > 0 && <BowShotOverlay isUp={isUp} shotKey={shotId} />}
      </AnimatePresence>

      <motion.span
        key={`pulse-${shotId}`}
        initial={false}
        animate={{ scale: shotId > 0 ? [1, 1.12, 1] : 1 }}
        transition={{ duration: 0.42, ease: SHOT_EASE }}
        className="relative z-10 flex items-center justify-center"
      >
        <Icon className={iconClassName} strokeWidth={2.25} />
      </motion.span>
    </button>
  );
}
