'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'

type UIContextType = {
  layoutReady: boolean
  hasDecided: boolean
  showOnboarding: boolean
  showGuide: boolean
  showGuideModal: boolean
  openGuideModal: () => void
  closeGuideModal: () => void
  showPendingMessage: boolean
  dismissPendingMessage: () => void
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
  finalizeOnboarding: () => Promise<void>
}

const UIContext = createContext<UIContextType | null>(null)

export function UIProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { session, isPending, isVerified, isLoading, user } = useAuth()
  const [layoutReady, setLayoutReady] = useState(false)
  const [hasDecided, setHasDecided] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [showGuideModal, setShowGuideModal] = useState(false)
  const [showPendingMessage, setShowPendingMessage] = useState(false)
  const [suppressOnboardingOnce, setSuppressOnboardingOnce] = useState(false)
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [registerModalInitialMode, setRegisterModalInitialMode] = useState<'signup' | 'signin' | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isOfferOpen, setOfferOpen] = useState(false)
  const [lunaOpenRequested, setLunaOpenRequested] = useState(false)
  const [profileOnboardingCompleted, setProfileOnboardingCompleted] = useState<boolean | null>(null)
  const hasAutoOpenedGuide = useRef(false)

  const clearOverlayState = useCallback(() => {
    setShowGuide(false)
    setShowOnboarding(false)
  }, [])

  const finalizeOnboarding = useCallback(async () => {
    setProfileOnboardingCompleted(true)
    setLayoutReady(true)
    clearOverlayState()
    if (isVerified && user?.id && isSupabaseConfigured()) {
      const supabase = createClient()
      await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id)
    }
  }, [isVerified, user?.id, clearOverlayState])

  useEffect(() => {
    if (pathname !== '/') {
      setLayoutReady(true)
      setHasDecided(true)
    }
  }, [pathname])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ua = navigator.userAgent.toLowerCase()
    const isBot = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|rogerbot|linkedinbot|embedly|quora link preview|showyoubot|outbrain|pinterest|slackbot|vkshare|w3c_validator/i.test(ua)
    if (isBot && pathname === '/') {
      setLayoutReady(true)
      setHasDecided(true)
      hasAutoOpenedGuide.current = true
    }
  }, [pathname])

  useEffect(() => {
    if (pathname !== '/' || typeof window === 'undefined') return
    if (showRegisterModal || showPendingMessage) return
    if (hasAutoOpenedGuide.current) return

    if (isLoading) return
    if (session) {
      setLayoutReady(true)
      setHasDecided(true)
      return
    }
    const guestDismissed = localStorage.getItem('guestOnboardingDismissed')
    if (guestDismissed) {
      setLayoutReady(true)
      setHasDecided(true)
      return
    }
    hasAutoOpenedGuide.current = true
    setShowGuide(true)
    setShowOnboarding(true)
    setHasDecided(true)
  }, [pathname, session, isLoading, showRegisterModal, showPendingMessage])

  useEffect(() => {
    if (pathname !== '/' || isLoading) return
    if (session) setHasDecided(true)
  }, [pathname, session, isLoading])

  useEffect(() => {
    if (session && (showOnboarding || showGuide)) {
      setShowOnboarding(false)
      setShowGuide(false)
      if (user?.id && isVerified) {
        finalizeOnboarding().catch(() => {})
      } else if (typeof window !== 'undefined') {
        setLayoutReady(true)
        localStorage.setItem('onboarding_done', 'true')
      }
    }
  }, [session, showOnboarding, showGuide, user?.id, isVerified, finalizeOnboarding])

  useEffect(() => {
    if (!toastMessage) return
    const t = setTimeout(() => setToastMessage(null), 3000)
    return () => clearTimeout(t)
  }, [toastMessage])

  useEffect(() => {
    if (!isLoading && isPending) {
      setShowPendingMessage(true)
    } else {
      setShowPendingMessage(false)
    }
  }, [isLoading, isPending])

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

  const openGuideModal = useCallback(() => {
    setShowGuideModal(true)
  }, [])
  const closeGuideModal = useCallback(() => {
    setShowGuideModal(false)
  }, [])

  const closeOnboarding = useCallback(() => {
    const wasGuide = showGuide
    clearOverlayState()
    setLayoutReady(true)
    if (typeof window !== 'undefined' && !wasGuide) {
      if (session) localStorage.setItem('onboarding_done', 'true')
      else localStorage.setItem('guestOnboardingDismissed', 'true')
    }
  }, [showGuide, session, clearOverlayState])

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
        hasDecided,
        showOnboarding,
        showGuide,
        showGuideModal,
        openGuideModal,
        closeGuideModal,
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
