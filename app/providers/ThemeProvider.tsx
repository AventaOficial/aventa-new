'use client'

import { createContext, useContext, useState, useEffect } from 'react'

type Theme = 'light' | 'dark'

type ThemeContextType = {
  theme: Theme
  toggleTheme: () => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const storedTheme = localStorage.getItem('aventa-theme') as Theme | null
    const isDarkMode = document.documentElement.classList.contains('dark')
    const initialTheme = storedTheme || (isDarkMode ? 'dark' : 'light')
    setTheme(initialTheme)
    if (initialTheme === 'dark' && !isDarkMode) {
      document.documentElement.classList.add('dark')
    } else if (initialTheme === 'light' && isDarkMode) {
      document.documentElement.classList.remove('dark')
    }
    
    setMounted(true)
  }, [])

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

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    const html = document.documentElement
    if (newTheme === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
    localStorage.setItem('aventa-theme', newTheme)
    setTheme(newTheme)
    window.dispatchEvent(new CustomEvent('theme-change', { detail: newTheme }))
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
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
