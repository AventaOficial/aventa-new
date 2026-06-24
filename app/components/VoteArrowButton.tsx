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

const FLOAT_DURATION = 0.3;

function FloatingDelta({ value, id }: { value: '+1' | '-1'; id: number }) {
  const isUp = value === '+1';
  return (
    <motion.span
      key={id}
      initial={{ opacity: 0, y: 0 }}
      animate={{ opacity: [0, 1, 0], y: isUp ? -12 : 12 }}
      transition={{ duration: FLOAT_DURATION, ease: [0.22, 1, 0.36, 1] }}
      className={`pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 text-[10px] font-medium tabular-nums tracking-tight text-gray-500 dark:text-gray-400 ${
        isUp ? '-top-0.5' : '-bottom-0.5'
      }`}
      aria-hidden
    >
      {value}
    </motion.span>
  );
}

/** Voto con flecha — spring suave y delta flotante (+1 / -1). */
export default function VoteArrowButton({
  direction,
  active,
  onClick,
  className = '',
  iconClassName = '',
  disabled,
  'aria-label': ariaLabel,
}: VoteArrowButtonProps) {
  const [floatId, setFloatId] = useState(0);
  const [motionId, setMotionId] = useState(0);
  const isUp = direction === 'up';
  const Icon = isUp ? ArrowUp : ArrowDown;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!active) setFloatId((n) => n + 1);
    setMotionId((n) => n + 1);
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
      <AnimatePresence>
        {floatId > 0 && <FloatingDelta value={isUp ? '+1' : '-1'} id={floatId} />}
      </AnimatePresence>

      <motion.span
        key={motionId}
        initial={{ y: 0 }}
        animate={{ y: [0, isUp ? -4 : 4, 0] }}
        transition={{
          duration: 0.32,
          times: [0, 0.38, 1],
          type: 'spring',
          stiffness: 480,
          damping: 24,
          mass: 0.55,
        }}
        className="relative z-10 flex items-center justify-center"
      >
        <Icon className={iconClassName} strokeWidth={2} />
      </motion.span>
    </button>
  );
}
