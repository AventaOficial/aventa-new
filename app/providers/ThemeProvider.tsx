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

  // Sincronizar con el estado inicial del DOM
  useEffect(() => {
    // Leer del script que se ejecutó antes (en layout.tsx)
    const storedTheme = localStorage.getItem('aventa-theme') as Theme | null
    const isDarkMode = document.documentElement.classList.contains('dark')
    
    // El script en layout.tsx ya configuró el DOM, solo sincronizar el estado
    const initialTheme = storedTheme || (isDarkMode ? 'dark' : 'light')
    setTheme(initialTheme)
    
    // Asegurar que el DOM esté sincronizado (por si acaso)
    if (initialTheme === 'dark' && !isDarkMode) {
      document.documentElement.classList.add('dark')
    } else if (initialTheme === 'light' && isDarkMode) {
      document.documentElement.classList.remove('dark')
    }
    
    setMounted(true)
  }, [])

  // Escuchar eventos personalizados de cambio de tema
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
    
    // Actualizar DOM primero (más importante)
    const html = document.documentElement
    if (newTheme === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
    
    // Actualizar localStorage
    localStorage.setItem('aventa-theme', newTheme)
    
    // Actualizar estado React (esto fuerza re-renders)
    setTheme(newTheme)
    
    // Disparar evento personalizado para notificar a otros listeners
    window.dispatchEvent(new CustomEvent('theme-change', { detail: newTheme }))
  }

  // Siempre proporcionar el contexto, incluso antes de montarse
  // Esto evita errores durante la hidratación
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
