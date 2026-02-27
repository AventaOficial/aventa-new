'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client'

type AuthContextType = {
  user: User | null
  session: Session | null
  isLoading: boolean
  /** Sesión existe pero email no verificado; no se considera sesión usable */
  isPending: boolean
  /** Sesión existe y email verificado */
  isVerified: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null }>
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setIsLoading(false)
      return
    }
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      setIsLoading(false)
    })

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      setIsLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured()) return { error: new Error('Supabase no configurado') }
    const { error } = await createClient().auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signUp = async (email: string, password: string, displayName?: string) => {
    if (!isSupabaseConfigured()) return { error: new Error('Supabase no configurado') }
    const { error } = await createClient().auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName || null } },
    })
    return { error: error as Error | null }
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

  const signInWithOAuth = async (provider: 'google' | 'apple') => {
    if (!isSupabaseConfigured()) return { error: new Error('Supabase no configurado') }
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const { data, error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: origin },
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
