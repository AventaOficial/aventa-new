'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'
import { MeSpaceShell } from '@/app/me/dashboard/MeSectionPage'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/app/providers/ThemeProvider'
import { useUI } from '@/app/providers/UIProvider'
import { useOffersRealtime } from '@/lib/hooks/useOffersRealtime'
import { mapOfferToCard, type CardOffer, type RankedOfferSource } from '@/lib/offers/transform'
import { applyFavoriteToggle } from '@/lib/offers/applyFavoriteToggle'
import { notifyUserError } from '@/lib/utils/handleError'
import FavoriteOfferTile from './FavoriteOfferTile'
import FavoritesEmptyState from './FavoritesEmptyState'
import CommunityTopCarousel from './CommunityTopCarousel'

const GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4'

function FavoritesPageInner() {
  useTheme()
  const router = useRouter()
  const { showToast } = useUI()
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [offers, setOffers] = useState<CardOffer[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useOffersRealtime(setOffers)

  const favoriteIds = useMemo(() => new Set(offers.map((offer) => offer.id)), [offers])

  const retry = () => {
    setStatus('loading')
    setAttempt((n) => n + 1)
  }

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/')
          return
        }
        setUserId(user.id)

        const { data: rows, error } = await supabase
          .from('offer_favorites')
          .select(`
          offer_id,
          offers (
            id,
            title,
            price,
            original_price,
            image_url,
            store,
            offer_url,
            description,
            hunter_comment,
            msi_months,
            bank_coupon,
            coupons,
            conditions,
            created_at,
            created_by,
            upvotes_count,
            downvotes_count,
            ranking_momentum,
            profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag, amazon_tracking_tag, slug)
          )
        `)
          .eq('user_id', user.id)

        if (error) {
          notifyUserError(showToast, 'No pudimos cargar tus favoritos. Revisa tu conexión.', 'me:favorites', error)
          setOffers([])
          setStatus('error')
          return
        }

        const extracted: CardOffer[] = []
        for (const row of rows ?? []) {
          const raw = row as { offer_id: string; offers: RankedOfferSource | RankedOfferSource[] | null }
          const offerData = Array.isArray(raw.offers) ? raw.offers[0] : raw.offers
          if (offerData) {
            extracted.push(mapOfferToCard(offerData))
          }
        }
        setOffers(extracted)
        setStatus('ready')
      } catch (e) {
        notifyUserError(showToast, 'No pudimos cargar tus favoritos.', 'me:favorites', e)
        setOffers([])
        setStatus('error')
      }
    }
    load()
  }, [router, showToast, attempt])

  const toggleFavorite = async (offer: CardOffer) => {
    if (!userId || savingId) return
    const wasFavorite = favoriteIds.has(offer.id)
    setSavingId(offer.id)
    const result = await applyFavoriteToggle({
      client: createClient(),
      userId,
      offerId: offer.id,
      wasFavorite,
    })
    setSavingId(null)
    if (!result.ok) {
      showToast('No se pudo actualizar tus favoritos. Inténtalo de nuevo.')
      return
    }
    if (result.isFavorite) {
      setOffers((prev) => (prev.some((o) => o.id === offer.id) ? prev : [offer, ...prev]))
      if (typeof window !== 'undefined' && !localStorage.getItem('favorite_onboarding_seen')) {
        showToast('Listo — no la pierdas de vista.')
        localStorage.setItem('favorite_onboarding_seen', 'true')
      } else {
        showToast('Guardada en favoritos.')
      }
    } else {
      setOffers((prev) => prev.filter((o) => o.id !== offer.id))
      showToast('Quitada de favoritos.')
    }
  }

  return (
    <MeSpaceShell
      tone="night"
      wide
      eyebrow="Favoritos"
      mark={<Heart className="h-3.5 w-3.5" aria-hidden />}
      title="Tu radar"
      accent="personal"
      lede="Guarda las ofertas que no quieres perder."
    >

          {status === 'loading' ? (
            <div className="h-80 animate-pulse rounded-[28px] border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none" aria-busy="true" aria-label="Cargando tus favoritos" />
          ) : status === 'error' ? (
            <div role="alert" className="rounded-[28px] border border-[var(--me-line)] bg-[var(--me-card)] text-[var(--me-ink)] shadow-sm dark:shadow-none px-6 py-12 text-center">
              <p className="text-[17px] font-semibold text-[var(--me-ink)]">No pudimos cargar tus favoritos</p>
              <p className="mx-auto mt-2 max-w-sm text-[14px] text-[var(--me-muted)]">
                Tus ofertas guardadas siguen ahí. Revisa tu conexión e inténtalo de nuevo.
              </p>
              <button
                type="button"
                onClick={retry}
                className="mt-6 inline-flex min-h-11 items-center rounded-full bg-violet-600 px-5 text-[14px] font-semibold text-white transition-colors hover:bg-violet-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--me-page)]"
              >
                Reintentar
              </button>
            </div>
          ) : offers.length === 0 ? (
            <FavoritesEmptyState />
          ) : (
            <ul className={GRID}>
              {offers.map((offer) => (
                <li key={offer.id} className="flex">
                  <FavoriteOfferTile
                    offer={offer}
                    isFavorite
                    saving={savingId === offer.id}
                    onToggleFavorite={(o) => void toggleFavorite(o)}
                    className="w-full"
                  />
                </li>
              ))}
            </ul>
          )}

          {status === 'ready' && offers.length > 0 ? (
            <div className="mt-10">
              <CommunityTopCarousel
                favoriteIds={favoriteIds}
                savingId={savingId}
                onToggleFavorite={(o) => void toggleFavorite(o)}
              />
            </div>
          ) : null}
    </MeSpaceShell>
  )
}

export default function FavoritesPage() {
  return (
    <Suspense
      fallback={
        <div className="me-canvas flex min-h-screen items-center justify-center">
          <div className="text-[var(--me-muted)]">Cargando favoritos…</div>
        </div>
      }
    >
      <FavoritesPageInner />
    </Suspense>
  )
}
