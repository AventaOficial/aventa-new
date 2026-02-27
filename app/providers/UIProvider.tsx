'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'

type UIContextType = {
  /** En home: false hasta decidir si mostrar onboarding, para no mostrar el home por un frame */
  layoutReady: boolean
  showOnboarding: boolean
  showGuide: boolean
  showPendingMessage: boolean
  dismissPendingMessage: () => void
  /** Flag en memoria: tras signUp, suprimir onboarding en el mismo ciclo; se limpia en siguiente render estable o navegación */
  markJustSignedUp: () => void
  showRegisterModal: boolean
  registerModalInitialMode: 'signup' | 'signin' | null
  openRegisterModal: (mode?: 'signup' | 'signin') => void
  closeRegisterModal: () => void
  toastMessage: string | null
  showToast: (message: string) => void
  isOfferOpen: boolean
  setOfferOpen: (v: boolean) => void
  openLuna: () => void
  lunaOpenRequested: boolean
  setLunaOpenRequested: (v: boolean) => void
  openOnboarding: () => void
  openGuide: () => void
  closeOnboarding: () => void
  /** Cierra overlay, limpia todo el estado de onboarding y persiste en perfil. Nada puede reabrir tras esto. */
  finalizeOnboarding: () => Promise<void>
}

const UIContext = createContext<UIContextType | null>(null)

export function UIProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { session, isPending, isVerified, isLoading, user } = useAuth()
  /** En "/": false hasta que auth cargó y decidimos si mostrar onboarding; evita flash home → overlay */
  const [layoutReady, setLayoutReady] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showPendingMessage, setShowPendingMessage] = useState(false)
  /** En memoria: true justo tras signUp para no mostrar onboarding en el mismo ciclo; se limpia solo. */
  const [suppressOnboardingOnce, setSuppressOnboardingOnce] = useState(false)
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [registerModalInitialMode, setRegisterModalInitialMode] = useState<'signup' | 'signin' | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isOfferOpen, setOfferOpen] = useState(false)
  const [lunaOpenRequested, setLunaOpenRequested] = useState(false)
  /** Solo true/false cuando el perfil se cargó correctamente; null = no cargado o error (no asumir). */
  const [profileOnboardingCompleted, setProfileOnboardingCompleted] = useState<boolean | null>(null)
  const hasAutoOpenedGuide = useRef(false)

  /** Fuera de home: mostrar contenido de inmediato */
  useEffect(() => {
    if (pathname !== '/') setLayoutReady(true)
  }, [pathname])

  /** Onboarding automático: solo para guests (sin sesión). Mientras decidimos, no mostrar home (layoutReady false). */
  useEffect(() => {
    if (pathname !== '/' || typeof window === 'undefined') return
    if (showRegisterModal || showPendingMessage) return
    if (hasAutoOpenedGuide.current) return

    if (isLoading) return
    setLayoutReady(true)
    if (session) return

    const guestDismissed = localStorage.getItem('guestOnboardingDismissed')
    if (guestDismissed) return

    hasAutoOpenedGuide.current = true
    setShowGuide(true)
    setShowOnboarding(true)
  }, [pathname, session, isLoading, showRegisterModal, showPendingMessage])

  // Si hay sesión y el onboarding está abierto (ej. se mostró antes de que cargara la auth), cerrarlo
  useEffect(() => {
    if (session && (showOnboarding || showGuide)) {
      setShowOnboarding(false)
      setShowGuide(false)
    }
  }, [session, showOnboarding, showGuide])

  useEffect(() => {
    if (!toastMessage) return
    const t = setTimeout(() => setToastMessage(null), 3000)
    return () => clearTimeout(t)
  }, [toastMessage])

  // Pending: mostrar mensaje de verificación; no onboarding
  useEffect(() => {
    if (!isLoading && isPending) {
      setShowPendingMessage(true)
    } else {
      setShowPendingMessage(false)
    }
  }, [isLoading, isPending])

  // Perfil: cargar onboarding_completed solo para finalizeOnboarding (guía)
  useEffect(() => {
    if (!session || !isVerified || !user?.id) {
      setProfileOnboardingCompleted(null)
      return
    }
    if (!isSupabaseConfigured()) {
      setProfileOnboardingCompleted(null)
      return
    }
    const supabase = createClient()
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single()
        if (error) {
          setProfileOnboardingCompleted(null)
          return
        }
        if (data != null && typeof data.onboarding_completed === 'boolean') {
          setProfileOnboardingCompleted(data.onboarding_completed)
        } else {
          setProfileOnboardingCompleted(null)
        }
      } catch {
        setProfileOnboardingCompleted(null)
      }
    })()
  }, [session, isVerified, user?.id])

  const openOnboarding = () => {
    setShowGuide(false)
    setShowOnboarding(true)
  }

  const openGuide = () => {
    setShowGuide(true)
    setShowOnboarding(true)
  }

  /** Única función que cierra overlay (showOnboarding + showGuide). Evita duplicar lógica. */
  const clearOverlayState = useCallback(() => {
    setShowGuide(false)
    setShowOnboarding(false)
  }, [])

  const closeOnboarding = useCallback(() => {
    const wasGuide = showGuide
    clearOverlayState()
    if (typeof window !== 'undefined' && !wasGuide) {
      if (session) localStorage.setItem('onboarding_done', 'true')
      else localStorage.setItem('guestOnboardingDismissed', 'true')
    }
  }, [showGuide, session, clearOverlayState])

  /**
   * Finalizar onboarding: cierra overlay y limpia estado de forma que ningún useEffect pueda reabrir.
   * Orden: (1) marcar perfil completado en estado, (2) cerrar overlay; luego persistir en DB.
   */
  const finalizeOnboarding = useCallback(async () => {
    setProfileOnboardingCompleted(true)
    clearOverlayState()
    if (isVerified && user?.id && isSupabaseConfigured()) {
      const supabase = createClient()
      await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id)
    }
  }, [isVerified, user?.id, clearOverlayState])

  const dismissPendingMessage = useCallback(() => setShowPendingMessage(false), [])
  const markJustSignedUp = useCallback(() => setSuppressOnboardingOnce(true), [])
  const openRegisterModal = useCallback((mode?: 'signup' | 'signin') => {
    setRegisterModalInitialMode(mode ?? 'signup')
    setShowRegisterModal(true)
  }, [])
  const closeRegisterModal = useCallback(() => {
    setShowRegisterModal(false)
    setRegisterModalInitialMode(null)
  }, [])
  const showToast = useCallback((message: string) => setToastMessage(message), [])
  const openLuna = useCallback(() => setLunaOpenRequested(true), [])

  return (
    <UIContext.Provider
      value={{
        layoutReady,
        showOnboarding,
        showGuide,
        showPendingMessage,
        dismissPendingMessage,
        markJustSignedUp,
        showRegisterModal,
        registerModalInitialMode,
        openRegisterModal,
        closeRegisterModal,
        toastMessage,
        showToast,
        isOfferOpen,
        setOfferOpen,
        openLuna,
        lunaOpenRequested,
        setLunaOpenRequested,
        openOnboarding,
        openGuide,
        closeOnboarding,
        finalizeOnboarding,
      }}
    >
      {children}
    </UIContext.Provider>
  )
}

export function useUI() {
  const context = useContext(UIContext)
  if (!context) {
    throw new Error('useUI must be used within UIProvider')
  }
  return context
}
