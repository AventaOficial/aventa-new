'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import ClientLayout from '@/app/ClientLayout'
import OfferCard from '@/app/components/OfferCard'
import OfferCardSkeleton from '@/app/components/OfferCardSkeleton'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/app/providers/ThemeProvider'
import { useUI } from '@/app/providers/UIProvider'
import { useOffersRealtime } from '@/lib/hooks/useOffersRealtime'
import {
  fetchBatchUserData,
  type VoteMap,
  type VoteValueMap,
  type FavoriteMap,
} from '@/lib/offers/batchUserData'
import { mapOfferToCard, type CardOffer, type RankedOfferSource } from '@/lib/offers/transform'
import { notifyUserError } from '@/lib/utils/handleError'
import { buildOfferPublicPath } from '@/lib/offerPath'

function FavoritesPageInner() {
  useTheme()
  const router = useRouter()
  const { showToast } = useUI()
  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState<CardOffer[]>([])
  const [voteMap, setVoteMap] = useState<VoteMap>({})
  const [voteValueMap, setVoteValueMap] = useState<VoteValueMap>({})
  const [favoriteMap, setFavoriteMap] = useState<FavoriteMap>({})

  useOffersRealtime(setOffers)

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/')
          return
        }

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
            msi_months,
            bank_coupon,
            coupons,
            created_at,
            created_by,
            upvotes_count,
            downvotes_count,
            ranking_momentum,
            profiles:public_profiles_view!created_by(display_name, avatar_url, leader_badge, ml_tracking_tag, slug)
          )
        `)
          .eq('user_id', user.id)

        if (error) {
          notifyUserError(showToast, 'No pudimos cargar tus favoritos. Revisa tu conexión.', 'me:favorites', error)
          setOffers([])
          setLoading(false)
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
        setLoading(false)

        if (extracted.length > 0 && user.id) {
          fetchBatchUserData(user.id, extracted.map((o) => o.id)).then(({ voteMap: vm, voteValueMap: vvm, favoriteMap: fm }) => {
            setVoteMap(vm)
            setVoteValueMap(vvm)
            setFavoriteMap(fm)
          })
        }
      } catch (e) {
        notifyUserError(showToast, 'No pudimos cargar tus favoritos.', 'me:favorites', e)
        setOffers([])
        setLoading(false)
      }
    }
    load()
  }, [router, showToast])

  const handleFavoriteChange = (isFavorite: boolean) => {
    if (isFavorite && typeof window !== 'undefined' && !localStorage.getItem('favorite_onboarding_seen')) {
      showToast("Cada favorito ayuda a personalizar lo que ves. La comunidad encuentra las mejores ofertas.")
      localStorage.setItem('favorite_onboarding_seen', 'true')
    }
  }

  const handleRemoveFromList = (offerId: string) => {
    setOffers((prev) => prev.filter((o) => o.id !== offerId))
  }

  const handleVoteChange = (offerId: string, value: 1 | -1 | 0, storedWeight?: number) => {
    setVoteMap((prev) => {
      const next = { ...prev }
      if (value === 0) delete next[offerId]
      else next[offerId] = value
      return next
    })
    setVoteValueMap((prev) => {
      const next = { ...prev }
      if (value === 0) delete next[offerId]
      else if (storedWeight !== undefined) next[offerId] = storedWeight
      return next
    })
  }

  return (
    <ClientLayout>
      <div className="min-h-screen bg-transparent text-gray-900 dark:text-gray-100">
        <section className="max-w-5xl mx-auto px-4 md:px-8 py-16">
          <h1 className="text-2xl font-bold mb-8">Tus favoritos</h1>
          {loading ? (
            <div className="space-y-4 md:space-y-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: i * 0.03 }}
                >
                  <OfferCardSkeleton />
                </motion.div>
              ))}
            </div>
          ) : offers.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">Aún no has guardado ofertas.</p>
          ) : (
            <div className="space-y-4 md:space-y-6">
              {offers.map((offer, index) => (
                <motion.div
                  key={offer.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeInOut' }}
                >
                  <OfferCard
                    offerId={offer.id}
                    title={offer.title}
                    brand={offer.brand}
                    originalPrice={offer.originalPrice}
                    discountPrice={offer.discountPrice}
                    discount={offer.discount}
                    description={offer.description}
                    image={offer.image}
                    upvotes={offer.upvotes}
                    downvotes={offer.downvotes}
                    votes={offer.votes}
                    offerUrl={offer.offerUrl}
                    author={offer.author}
                    onCardClick={() => router.push(buildOfferPublicPath(offer.id, offer.title))}
                    onFavoriteChange={(isFav) => {
                      handleFavoriteChange(isFav)
                      if (!isFav) handleRemoveFromList(offer.id)
                    }}
                    onVoteChange={handleVoteChange}
                    userVote={voteMap[offer.id] ?? null}
                    userVoteStoredValue={voteValueMap[offer.id] ?? null}
                    isLiked={!!favoriteMap[offer.id]}
                    createdAt={offer.createdAt}
                    msiMonths={offer.msiMonths}
                    bankCoupon={offer.bankCoupon}
                    coupons={offer.coupons}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </section>
        <div className="h-24 md:h-0" />
      </div>
    </ClientLayout>
  )
}

export default function FavoritesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F5F5F7] dark:bg-[#0a0a0a]">
          <div className="text-gray-500 dark:text-gray-400">Cargando favoritos…</div>
        </div>
      }
    >
      <FavoritesPageInner />
    </Suspense>
  )
}
