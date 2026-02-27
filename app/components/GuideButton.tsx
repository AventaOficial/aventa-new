'use client';

import { HelpCircle } from 'lucide-react';
import { useUI } from '@/app/providers/UIProvider';

interface GuideButtonProps {
  compact?: boolean;
}

export default function GuideButton({ compact }: GuideButtonProps) {
  const { openGuide } = useUI();
  const size = compact ? 'h-8 w-8' : 'h-9 w-9';
  const iconSize = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        openGuide();
      }}
      className={`relative z-[100] flex ${size} items-center justify-center rounded-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border border-[#E5E7EB] dark:border-gray-700 shadow-sm transition-transform duration-200 active:scale-95 dark:shadow-none pointer-events-auto`}
      aria-label="Abrir guía"
    >
      <HelpCircle className={`${iconSize} text-gray-700 dark:text-gray-300 pointer-events-none`} />
    </button>
  );
}
