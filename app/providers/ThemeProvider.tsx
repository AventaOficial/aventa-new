'use client'

import { createContext, useContext, useState, useEffect } from 'react'

type Theme = 'light' | 'dark'
export type ThemePreference = 'light' | 'dark' | 'system'

type ThemeContextType = {
  theme: Theme
  preference: ThemePreference
  toggleTheme: () => void
  setThemePreference: (preference: ThemePreference) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextType | null>(null)

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const [preference, setPreference] = useState<ThemePreference>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('aventa-theme')
    const preference: ThemePreference = stored === 'dark' || stored === 'system' ? stored : 'light'
    const resolved = preference === 'system' ? systemTheme() : preference
    setPreference(preference)
    setTheme(resolved)
    applyTheme(resolved)
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || preference !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = media.matches ? 'dark' : 'light'
      setTheme(resolved)
      applyTheme(resolved)
    }
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [mounted, preference])

  useEffect(() => {
    if (!mounted) return

    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<Theme>
      if (customEvent.detail) {
        const newTheme = customEvent.detail
        setTheme(newTheme)
      }
    }

    window.addEventListener('theme-change', handleThemeChange)

    return () => {
      window.removeEventListener('theme-change', handleThemeChange)
    }
  }, [mounted])

  const setThemePreference = (next: ThemePreference) => {
    const resolved = next === 'system' ? systemTheme() : next
    localStorage.setItem('aventa-theme', next)
    setPreference(next)
    setTheme(resolved)
    applyTheme(resolved)
    window.dispatchEvent(new CustomEvent('theme-change', { detail: resolved }))
  }

  const toggleTheme = () => {
    setThemePreference(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        preference,
        toggleTheme,
        setThemePreference,
        isDark: theme === 'dark',
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
