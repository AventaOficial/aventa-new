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

/** Voto con flecha arriba/abajo y mini animación de disparo al pulsar. */
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
      className={`relative overflow-hidden ${className}`}
    >
      <motion.span
        key={`pulse-${shotId}`}
        initial={false}
        animate={{ scale: shotId > 0 ? [1, 1.16, 1] : 1 }}
        transition={{ duration: 0.26, ease: SHOT_EASE }}
        className="relative z-10 flex items-center justify-center"
      >
        <Icon className={iconClassName} strokeWidth={2.25} />
      </motion.span>

      <AnimatePresence>
        {shotId > 0 && (
          <motion.span
            key={`shot-${shotId}`}
            initial={{ opacity: 0.9, y: 0, scale: 0.5 }}
            animate={{
              opacity: 0,
              y: isUp ? -15 : 15,
              scale: 0.28,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.36, ease: SHOT_EASE }}
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
            aria-hidden
          >
            <Icon className="h-[62%] w-[62%] text-violet-500 dark:text-violet-400" strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {shotId > 0 && (
          <motion.span
            key={`string-${shotId}`}
            initial={{ opacity: 0.45, scaleX: 0.35 }}
            animate={{ opacity: 0, scaleX: 1.05 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className={`pointer-events-none absolute left-1/2 z-0 h-px w-[68%] -translate-x-1/2 rounded-full bg-violet-400/55 dark:bg-violet-500/45 ${
              isUp ? 'bottom-1.5' : 'top-1.5'
            }`}
            aria-hidden
          />
        )}
      </AnimatePresence>
    </button>
  );
}
