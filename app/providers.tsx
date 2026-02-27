'use client'

import { UIProvider } from './providers/UIProvider'
import { ThemeProvider } from './providers/ThemeProvider'
import { AuthProvider } from './providers/AuthProvider'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <UIProvider>{children}</UIProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

