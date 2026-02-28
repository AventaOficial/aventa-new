'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import ClientLayout from '@/app/ClientLayout'
import OfferCard from '@/app/components/OfferCard'
import OfferCardSkeleton from '@/app/components/OfferCardSkeleton'
import OfferModal from '@/app/components/OfferModal'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/app/providers/ThemeProvider'
import { useUI } from '@/app/providers/UIProvider'
import { useOffersRealtime } from '@/lib/hooks/useOffersRealtime'
import { fetchBatchUserData, type VoteMap, type FavoriteMap } from '@/lib/offers/batchUserData'

type OfferRow = {
  id: string
  title: string
  price: number
  original_price: number | null
  image_url: string | null
  store: string | null
  offer_url: string | null
  description: string | null
  created_at?: string | null
  created_by?: string | null
  upvotes_count?: number | null
  downvotes_count?: number | null
  profiles?:
    | { display_name: string | null; avatar_url: string | null }
    | { display_name: string | null; avatar_url: string | null }[]
    | null
}

type MappedOffer = {
  id: string
  title: string
  brand: string
  originalPrice: number
  discountPrice: number
  discount: number
  description?: string
  upvotes: number
  downvotes: number
  offerUrl: string
  image?: string
  votes: { up: number; down: number; score: number }
  author: { username: string; avatar_url?: string | null }
}

function rowToOffer(row: OfferRow): MappedOffer {
  const originalPrice = Number(row.original_price) || 0
  const discountPrice = Number(row.price) || 0
  const discount =
    originalPrice > 0 ? Math.round((1 - discountPrice / originalPrice) * 100) : 0
  const up = row.upvotes_count ?? 0
  const down = row.downvotes_count ?? 0
  const score = up - down
  const rawProf = row.profiles
  const prof = Array.isArray(rawProf) ? rawProf[0] : rawProf
  return {
    id: row.id,
    title: row.title,
    brand: row.store ?? '',
    originalPrice,
    discountPrice,
    discount,
    upvotes: up,
    downvotes: down,
    offerUrl: row.offer_url?.trim() ?? '',
    image: row.image_url ? row.image_url : undefined,
    description: row.description?.trim() || undefined,
    votes: { up, down, score },
    author: {
      username: prof?.display_name?.trim() || 'Usuario',
      avatar_url: prof?.avatar_url ?? null,
    },
  }
}

export default function FavoritesPage() {
  useTheme()
  const router = useRouter()
  const { showToast } = useUI()
  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState<MappedOffer[]>([])
  const [voteMap, setVoteMap] = useState<VoteMap>({})
  const [favoriteMap, setFavoriteMap] = useState<FavoriteMap>({})
  const [selectedOffer, setSelectedOffer] = useState<MappedOffer | null>(null)

  useOffersRealtime(setOffers)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }

      const { data: rows } = await supabase
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
            created_at,
            created_by,
            upvotes_count,
            downvotes_count,
            profiles:public_profiles_view!created_by(display_name, avatar_url)
          )
        `)
        .eq('user_id', user.id)

      const extracted: MappedOffer[] = []
      for (const row of rows ?? []) {
        const raw = row as { offer_id: string; offers: OfferRow | OfferRow[] | null }
        const offerData = Array.isArray(raw.offers) ? raw.offers[0] : raw.offers
        if (offerData) {
          extracted.push(rowToOffer(offerData))
        }
      }
      setOffers(extracted)
      setLoading(false)

      if (extracted.length > 0 && user.id) {
        fetchBatchUserData(user.id, extracted.map((o) => o.id)).then(({ voteMap: vm, favoriteMap: fm }) => {
          setVoteMap(vm)
          setFavoriteMap(fm)
        })
      }
    }
    load()
  }, [router])

  const handleFavoriteChange = (isFavorite: boolean) => {
    if (isFavorite && typeof window !== 'undefined' && !localStorage.getItem('favorite_onboarding_seen')) {
      showToast("Cada favorito ayuda a personalizar lo que ves. La comunidad encuentra las mejores ofertas.")
      localStorage.setItem('favorite_onboarding_seen', 'true')
    }
  }

  const handleRemoveFromList = (offerId: string) => {
    setOffers((prev) => prev.filter((o) => o.id !== offerId))
    if (selectedOffer?.id === offerId) setSelectedOffer(null)
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
                    onCardClick={() => setSelectedOffer(offer)}
                    onFavoriteChange={(isFav) => {
                      handleFavoriteChange(isFav)
                      if (!isFav) handleRemoveFromList(offer.id)
                    }}
                    userVote={voteMap[offer.id] ?? null}
                    isLiked={!!favoriteMap[offer.id]}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </section>
        <div className="h-24 md:h-0" />
        {selectedOffer && (
          <OfferModal
            isOpen={!!selectedOffer}
            onClose={() => setSelectedOffer(null)}
            title={selectedOffer.title}
            brand={selectedOffer.brand}
            originalPrice={selectedOffer.originalPrice}
            discountPrice={selectedOffer.discountPrice}
            discount={selectedOffer.discount}
            description={selectedOffer.description}
            offerUrl={selectedOffer.offerUrl}
            upvotes={selectedOffer.upvotes}
            downvotes={selectedOffer.downvotes}
            offerId={selectedOffer.id}
            author={selectedOffer.author}
            image={selectedOffer.image}
            isLiked={true}
            userVote={voteMap[selectedOffer.id] ?? 0}
            onFavoriteChange={(fav) => {
              if (!fav) {
                handleRemoveFromList(selectedOffer.id)
                setSelectedOffer(null)
              }
            }}
          />
        )}
      </div>
    </ClientLayout>
  )
}
