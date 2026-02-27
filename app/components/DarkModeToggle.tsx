'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/app/providers/ThemeProvider'

interface DarkModeToggleProps {
  compact?: boolean;
}

export default function DarkModeToggle({ compact }: DarkModeToggleProps) {
  const { isDark, toggleTheme } = useTheme()
  const size = compact ? 'h-8 w-8' : 'h-9 w-9'
  const iconSize = compact ? 'h-3.5 w-3.5' : 'h-4 w-4'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation();
        toggleTheme();
      }}
      className={`relative z-[100] flex ${size} items-center justify-center rounded-full bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border border-[#E5E7EB] dark:border-gray-700 shadow-sm transition-all duration-200 hover:scale-105 active:scale-95 pointer-events-auto`}
      aria-label="Toggle dark mode"
    >
      {isDark ? (
        <Sun className={`${iconSize} text-gray-700 dark:text-gray-300 pointer-events-none`} />
      ) : (
        <Moon className={`${iconSize} text-gray-700 pointer-events-none`} />
      )}
    </button>
  )
}
