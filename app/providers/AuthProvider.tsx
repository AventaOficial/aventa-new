'use client'

import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { User, Session } from '@supabase/supabase-js'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'
import { refreshSessionIfNeeded } from '@/lib/supabase/refreshSessionIfNeeded'

type AuthContextType = {
  user: User | null
  session: Session | null
  isLoading: boolean
  isPending: boolean
  isVerified: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>
  signInWithOAuth: (provider: 'google') => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const syncProfileDoneRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsLoading(false)
      return
    }
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      const next = s ? await refreshSessionIfNeeded(supabase, s) : null
      setSession(next)
      setUser(next?.user ?? null)
      if (!next?.user?.id) syncProfileDoneRef.current = null
      setIsLoading(false)
    })

    const hasAuthHash =
      typeof window !== 'undefined' &&
      window.location.hash &&
      /access_token|refresh_token/.test(window.location.hash)

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      const next = await refreshSessionIfNeeded(supabase, s)
      setSession(next)
      setUser(next?.user ?? null)
      if (!next?.user?.id) syncProfileDoneRef.current = null
      if (!hasAuthHash) setIsLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void supabase.auth.getSession().then(async ({ data: { session: s } }) => {
        if (!s) return
        const next = await refreshSessionIfNeeded(supabase, s)
        if (next && next.access_token !== s.access_token) {
          setSession(next)
          setUser(next.user)
        }
      })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  useEffect(() => {
    if (!session?.access_token || !user?.id) return
    if (syncProfileDoneRef.current === user.id) return
    syncProfileDoneRef.current = user.id
    fetch('/api/sync-profile', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(() => router.refresh())
      .catch(() => {})
  }, [session?.access_token, user?.id, router])

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured()) return { error: new Error('Supabase no configurado') }
    const { error } = await createClient().auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signUp = async (email: string, password: string, displayName?: string) => {
    if (!isSupabaseConfigured()) return { error: new Error('Supabase no configurado') }
    const { data, error } = await createClient().auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || null } },
    })
    const needsEmailConfirmation = !error && !!data?.user && !data?.session
    return { error: error as Error | null, needsEmailConfirmation }
  }

  const signOut = async () => {
    if (!isSupabaseConfigured()) return
    await createClient().auth.signOut()
  }

  const resetPassword = async (email: string) => {
    if (!isSupabaseConfigured()) return { error: new Error('Supabase no configurado') }
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin}/auth/reset-password`,
    })
    return { error: error as Error | null }
  }

  const signInWithOAuth = async (provider: 'google') => {
    if (!isSupabaseConfigured()) return { error: new Error('Supabase no configurado') }
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const { data, error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${origin}/auth/callback` },
    })
    if (error) return { error: error as Error | null }
    if (data?.url) window.location.href = data.url
    return { error: null }
  }

  const isPending = !!session && !(user?.email_confirmed_at)
  const isVerified = !!session && !!user?.email_confirmed_at

  return (
    <AuthContext.Provider value={{ user, session, isLoading, isPending, isVerified, signIn, signUp, signInWithOAuth, signOut, resetPassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
