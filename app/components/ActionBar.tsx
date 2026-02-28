'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Home, Users2, Heart, User, Plus, X, Image as ImageIcon, ChevronDown, ChevronUp, Info, Sparkles, Eye, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useUI } from '@/app/providers/UIProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { OFFER_CARD_DESCRIPTION_MAX_LENGTH } from '@/app/components/OfferCard';

function formatThousands(s: string): string {
  const digits = s.replace(/\D/g, '');
  if (digits === '') return '';
  return Number(digits).toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

function parsePriceString(s: string): string {
  return s.replace(/\D/g, '');
}

function parseDecimalPrice(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatPreviewPrice(s: string): string {
  const n = parseDecimalPrice(s);
  const formatted = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  return `$${formatted}`;
}

const COOLDOWN_SECONDS = 60;

export default function ActionBar() {
  useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const { isOfferOpen, showToast, openRegisterModal } = useUI();

  const isActive = (path: string, exact?: boolean) =>
    exact ? pathname === path : pathname.startsWith(path);
  const activeClasses = 'text-violet-600 dark:text-violet-400 bg-violet-100/80 dark:bg-violet-900/25';
  const inactiveClasses = 'text-[#6e6e73] dark:text-[#a3a3a3]';
  const { session } = useAuth();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showOptionalSection, setShowOptionalSection] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [formData, setFormData] = useState({
    title: '',
    offer_url: '',
    description: '',
    originalPrice: '',
    discountPrice: '',
    category: '',
    store: '',
    steps: '',
    conditions: '',
    coupons: '',
  });
  const [hasDiscount, setHasDiscount] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [msiMonths, setMsiMonths] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [mobileTab, setMobileTab] = useState<'form' | 'preview'>('form');

  useEffect(() => {
    if (showUploadModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showUploadModal]);

  useEffect(() => {
    if (!showSuccessMessage) return;
    const t = setTimeout(() => setShowSuccessMessage(false), 4000);
    return () => clearTimeout(t);
  }, [showSuccessMessage]);

  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const id = setInterval(() => {
      setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownRemaining]);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_IMAGE_SIZE) {
        showToast('Máximo 2MB');
        return;
      }
      const mime = file.type?.toLowerCase() ?? '';
      if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
        showToast('Solo jpg, jpeg, png o webp');
        return;
      }
      if (!session?.access_token) {
        showToast('Inicia sesión para subir imágenes');
        return;
      }
      setImageUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload-offer-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data?.error ?? 'Error al subir');
        return;
      }
      if (typeof data?.url !== 'string') return;
      if (!imageUrl) setImageUrl(data.url);
      else setImageUrls((prev) => [...prev, data.url]);
    } catch {
      showToast('Error al subir');
    } finally {
      setImageUploading(false);
    }
  };

  const isFormValid = () => {
    const baseValid =
      formData.title.trim() !== '' &&
      formData.originalPrice.trim() !== '' &&
      formData.category !== '' &&
      formData.store.trim() !== '';
    if (!hasDiscount) return baseValid;
    return baseValid && formData.discountPrice.trim() !== '';
  };

  const handleCancel = () => {
    setShowUploadModal(false);
    setFormData({
      title: '',
      offer_url: '',
      description: '',
      originalPrice: '',
      discountPrice: '',
      category: '',
      store: '',
      steps: '',
      conditions: '',
      coupons: '',
    });
    setShowOptionalSection(false);
    setImageUrl(null);
    setImageUrls([]);
    setMsiMonths(null);
    setHasDiscount(true);
    setMobileTab('form');
  };

  const handleSubmit = async () => {
    if (!isFormValid() || isSubmitting) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setIsSubmitting(true);
    const originalPriceNum = parseDecimalPrice(formData.originalPrice);
    const price = hasDiscount
      ? parseDecimalPrice(formData.discountPrice)
      : originalPriceNum;
    const allImages = imageUrl ? [imageUrl, ...imageUrls.filter((u) => u !== imageUrl)] : imageUrls;
    const firstImage = allImages[0] ?? '/placeholder.png';
    const payload = {
      title: formData.title.trim(),
      price,
      original_price: hasDiscount && formData.originalPrice.trim() ? originalPriceNum : null,
      hasDiscount,
      store: formData.store.trim(),
      image_url: firstImage,
      ...(allImages.length > 0 && { image_urls: allImages }),
      ...(msiMonths != null && msiMonths >= 1 && msiMonths <= 24 && { msi_months: msiMonths }),
      ...(formData.offer_url.trim() && { offer_url: formData.offer_url.trim() }),
      ...(formData.description.trim() && { description: formData.description.trim() }),
      ...(formData.steps.trim() && { steps: formData.steps.trim() }),
      ...(formData.conditions.trim() && { conditions: formData.conditions.trim() }),
      ...(formData.coupons.trim() && { coupons: formData.coupons.trim() }),
    };
    const token = session?.access_token ?? (await supabase.auth.getSession()).data.session?.access_token;
    const res = await fetch('/api/offers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    setIsSubmitting(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data?.error ?? 'Error al crear la oferta');
      return;
    }
    setShowSuccessMessage(true);
    setCooldownRemaining(COOLDOWN_SECONDS);
    handleCancel();
  };

  return (
    <>
      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] flex flex-col items-center ${isOfferOpen ? 'opacity-0 translate-y-6 pointer-events-none' : ''}`}
      >
        {showSuccessMessage && (
          <div className="w-full max-w-[calc(100%-2rem)] mx-4 mb-2 rounded-2xl bg-[#f5f5f7] dark:bg-[#1a1a1a] border border-[#e5e5e7] dark:border-[#262626] px-4 py-3 shadow-lg">
            <p className="text-sm text-[#1d1d1f] dark:text-[#fafafa]">
              Gracias por compartir. Revisaremos tu oferta pronto.
            </p>
          </div>
        )}
        {cooldownRemaining > 0 && (
          <p className="text-sm text-[#6e6e73] dark:text-[#a3a3a3] text-center mx-4 mb-2">
            Espera {cooldownRemaining}s para enviar otra oferta.
          </p>
        )}
        <div className="flex items-center justify-center gap-1 max-[400px]:gap-0.5 rounded-[28px] max-[400px]:rounded-2xl mx-4 max-[400px]:mx-2 bg-white/95 dark:bg-[#141414]/95 backdrop-blur-xl border border-[#e5e5e7] dark:border-[#262626] px-2 max-[400px]:px-1.5 py-2.5 max-[400px]:py-2 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
          <Link
            href="/"
            className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl max-[400px]:rounded-xl min-h-[52px] max-[400px]:min-h-[48px] min-w-[64px] max-[400px]:min-w-[56px] px-2 max-[400px]:px-1 py-2 transition-colors duration-300 ease-out active:scale-95 ${isActive('/', true) ? activeClasses : inactiveClasses}`}
          >
            <Home className="h-5 w-5 max-[400px]:h-4 max-[400px]:w-4" />
            <span className="text-[10px] max-[400px]:text-[9px] font-semibold">Inicio</span>
          </Link>
          <Link
            href="/communities"
            className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl max-[400px]:rounded-xl min-h-[52px] max-[400px]:min-h-[48px] min-w-[64px] max-[400px]:min-w-[56px] px-2 max-[400px]:px-1 py-2 transition-colors duration-300 ease-out active:scale-95 ${isActive('/communities') ? activeClasses : inactiveClasses}`}
          >
            <Users2 className="h-5 w-5 max-[400px]:h-4 max-[400px]:w-4" />
            <span className="text-[10px] max-[400px]:text-[9px] font-medium">Comunidades</span>
          </Link>
          <button
            type="button"
            disabled={cooldownRemaining > 0}
            onClick={() => {
              if (!session) {
                openRegisterModal('signup');
                return;
              }
              setShowSuccessMessage(false);
              setShowUploadModal(true);
            }}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl max-[400px]:rounded-xl min-h-[56px] max-[400px]:min-h-[52px] min-w-[64px] max-[400px]:min-w-[56px] px-2 max-[400px]:px-1 py-2.5 max-[400px]:py-2 transition-all duration-200 active:scale-95 bg-gradient-to-b from-violet-600 to-violet-700 dark:from-violet-500 dark:to-violet-600 text-white shadow-lg shadow-violet-500/25 ${cooldownRemaining > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Plus className="h-6 w-6 max-[400px]:h-5 max-[400px]:w-5 text-white" />
            <span className="text-[10px] max-[400px]:text-[9px] font-semibold text-white">Subir</span>
          </button>
          {session ? (
            <>
              <Link
                href="/me/favorites"
                className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl max-[400px]:rounded-xl min-h-[52px] max-[400px]:min-h-[48px] min-w-[64px] max-[400px]:min-w-[56px] px-2 max-[400px]:px-1 py-2 transition-colors duration-300 ease-out active:scale-95 ${isActive('/me/favorites') ? activeClasses : inactiveClasses}`}
              >
                <Heart className="h-5 w-5 max-[400px]:h-4 max-[400px]:w-4" />
                <span className="text-[10px] max-[400px]:text-[9px] font-medium">Favoritos</span>
              </Link>
              <Link
                href="/me"
                className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl max-[400px]:rounded-xl min-h-[52px] max-[400px]:min-h-[48px] min-w-[64px] max-[400px]:min-w-[56px] px-2 max-[400px]:px-1 py-2 transition-colors duration-300 ease-out active:scale-95 ${pathname === '/me' ? activeClasses : inactiveClasses}`}
              >
                <User className="h-5 w-5 max-[400px]:h-4 max-[400px]:w-4" />
                <span className="text-[10px] max-[400px]:text-[9px] font-medium">Perfil</span>
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => showToast('Inicia sesión para acceder')}
                className="flex flex-col items-center justify-center gap-0.5 rounded-2xl max-[400px]:rounded-xl min-h-[52px] max-[400px]:min-h-[48px] min-w-[64px] max-[400px]:min-w-[56px] px-2 max-[400px]:px-1 py-2 transition-colors duration-200 active:scale-95 text-[#6e6e73] dark:text-[#a3a3a3]"
              >
                <Heart className="h-5 w-5 max-[400px]:h-4 max-[400px]:w-4" />
                <span className="text-[10px] max-[400px]:text-[9px] font-medium">Favoritos</span>
              </button>
              <button
                type="button"
                onClick={() => showToast('Inicia sesión para acceder')}
                className="flex flex-col items-center justify-center gap-0.5 rounded-2xl max-[400px]:rounded-xl min-h-[52px] max-[400px]:min-h-[48px] min-w-[64px] max-[400px]:min-w-[56px] px-2 max-[400px]:px-1 py-2 transition-colors duration-200 active:scale-95 text-[#6e6e73] dark:text-[#a3a3a3]"
              >
                <User className="h-5 w-5 max-[400px]:h-4 max-[400px]:w-4" />
                <span className="text-[10px] max-[400px]:text-[9px] font-medium">Perfil</span>
              </button>
            </>
          )}
        </div>
      </div>

      <aside
        className={`hidden md:flex fixed left-0 top-0 h-screen w-28 z-50 flex-col items-center py-6 gap-1 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl border-r border-[#E5E7EB] dark:border-gray-700 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.2)] ${isOfferOpen ? 'pointer-events-none' : ''}`}
      >
        <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 px-2">Tus atajos</p>
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] transition-colors duration-300 ease-out ${pathname === '/' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-violet-600 dark:hover:text-violet-400'}`}
          aria-label="Inicio"
        >
          <Home className="h-6 w-6" />
          <span className="text-[10px] font-medium">Inicio</span>
        </Link>
        <Link
          href="/communities"
          className={`flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] transition-colors duration-300 ease-out ${pathname.startsWith('/communities') ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-violet-600 dark:hover:text-violet-400'}`}
          aria-label="Comunidades"
        >
          <Users2 className="h-6 w-6" />
          <span className="text-[10px] font-medium">Comunidades</span>
        </Link>
        <button
          type="button"
          disabled={cooldownRemaining > 0}
          onClick={() => {
            if (!session) {
              openRegisterModal('signup');
              return;
            }
            setShowSuccessMessage(false);
            setShowUploadModal(true);
          }}
          className={`flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] transition-all duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${cooldownRemaining > 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#2d2d2f] active:scale-95'} bg-[#1d1d1f] dark:bg-[#1d1d1f] text-white shadow-lg`}
          aria-label="Subir oferta"
        >
          <Plus className="h-6 w-6" />
          <span className="text-[10px] font-semibold text-white">Subir</span>
        </button>
        {session ? (
          <>
            <Link
              href="/me/favorites"
              className={`flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] transition-colors duration-300 ease-out ${pathname.startsWith('/me/favorites') ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-violet-600 dark:hover:text-violet-400'}`}
              aria-label="Favoritos"
            >
              <Heart className="h-6 w-6" />
              <span className="text-[10px] font-medium">Favoritos</span>
            </Link>
            <Link
              href="/me"
              className={`flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] transition-colors duration-300 ease-out ${pathname === '/me' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-violet-600 dark:hover:text-violet-400'}`}
              aria-label="Perfil"
            >
              <User className="h-6 w-6" />
              <span className="text-[10px] font-medium">Perfil</span>
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => showToast('Para acceder hay que iniciar sesión')}
              className="flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-violet-600 dark:hover:text-violet-400 transition-colors duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
              aria-label="Favoritos"
            >
              <Heart className="h-6 w-6" />
              <span className="text-[10px] font-medium">Favoritos</span>
            </button>
            <button
              type="button"
              onClick={() => showToast('Para acceder hay que iniciar sesión')}
              className="flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-violet-600 dark:hover:text-violet-400 transition-colors duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
              aria-label="Perfil"
            >
              <User className="h-6 w-6" />
              <span className="text-[10px] font-medium">Perfil</span>
            </button>
          </>
        )}
      </aside>

      <AnimatePresence>
        {showUploadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4"
            onClick={handleCancel}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-md" />
            <motion.div
              initial={{ scale: 0.98, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 8 }}
              transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="relative z-10 w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-7xl sm:rounded-3xl overflow-hidden bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
            >
              <div className="flex-shrink-0 flex items-center justify-between px-5 sm:px-8 py-4 sm:py-5 border-b border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-900">
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                    Subir oferta
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    Comparte lo que encuentres con la comunidad
                  </p>
                </div>
                <button
                  onClick={handleCancel}
                  className="p-2.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors duration-200 active:scale-95"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="md:hidden flex-shrink-0 flex border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setMobileTab('form')}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
                    mobileTab === 'form'
                      ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-600 dark:border-violet-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <FileText className="h-4 w-4" />
                  Completar
                </button>
                <button
                  onClick={() => setMobileTab('preview')}
                  className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
                    mobileTab === 'preview'
                      ? 'text-violet-600 dark:text-violet-400 border-b-2 border-violet-600 dark:border-violet-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <Eye className="h-4 w-4" />
                  Vista previa
                </button>
              </div>

              <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
                <div
                  className={`flex-1 md:flex-[0_0_45%] lg:flex-[0_0_42%] overflow-y-auto p-5 sm:p-6 md:p-8 space-y-5 min-w-0 ${
                    mobileTab !== 'form' ? 'hidden md:block' : ''
                  }`}
                >
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Título de la oferta *
                      </label>
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                      placeholder="Ej: iPhone 15 Pro Max 256GB"
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
                      />
                    </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Enlace de la oferta (URL)
                    </label>
                    <input
                      type="url"
                      value={formData.offer_url}
                      onChange={(e) => handleInputChange('offer_url', e.target.value)}
                      placeholder="https://..."
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      ¿Esta oferta tiene descuento?
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="hasDiscount"
                          checked={hasDiscount}
                          onChange={() => setHasDiscount(true)}
                          className="rounded-full border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Sí</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="hasDiscount"
                          checked={!hasDiscount}
                          onChange={() => setHasDiscount(false)}
                          className="rounded-full border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">No</span>
                      </label>
                    </div>
                  </div>

                  <div className={`grid gap-4 ${hasDiscount ? 'grid-cols-2' : ''}`}>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Precio original *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={formData.originalPrice}
                        onChange={(e) => handleInputChange('originalPrice', e.target.value)}
                        placeholder="$0"
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
                      />
                    </div>
                    {hasDiscount && (
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                          Precio con descuento *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={formData.discountPrice}
                          onChange={(e) => handleInputChange('discountPrice', e.target.value)}
                          placeholder="$0"
                          className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
                        />
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Categoría *
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => handleInputChange('category', e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
                    >
                      <option value="">Selecciona una categoría</option>
                      <option value="electronics">Electrónica</option>
                      <option value="fashion">Moda</option>
                      <option value="home">Hogar</option>
                      <option value="sports">Deportes</option>
                      <option value="books">Libros</option>
                      <option value="other">Otros</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Tienda *
                    </label>
                    <input
                      type="text"
                      value={formData.store}
                      onChange={(e) => handleInputChange('store', e.target.value)}
                      placeholder="Ej: Tienda X, Tienda Y, etc."
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Descripción de la oferta
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      placeholder="Describe brevemente la oferta..."
                      rows={3}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none transition-colors duration-200"
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      En la tarjeta del home (escritorio) se muestran los primeros {OFFER_CARD_DESCRIPTION_MAX_LENGTH} caracteres.
                      {formData.description.trim().length > 0 && (
                        <span className="ml-1">
                          <span className={formData.description.trim().length > OFFER_CARD_DESCRIPTION_MAX_LENGTH ? 'text-amber-600 dark:text-amber-400' : ''}>
                            {formData.description.trim().length}/{OFFER_CARD_DESCRIPTION_MAX_LENGTH}
                          </span>
                          {' para la tarjeta'}
                        </span>
                      )}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Imagen(es) del producto (opcional)
                    </label>
                    <label className="block w-full rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800/50 px-4 py-8 text-center transition-all duration-200 ease-out hover:border-violet-400 dark:hover:border-violet-500 hover:bg-violet-50/30 dark:hover:bg-violet-900/10 cursor-pointer">
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleImageSelect}
                        disabled={imageUploading}
                        className="hidden"
                      />
                      <ImageIcon className="h-8 w-8 text-gray-400 dark:text-gray-500 mx-auto mb-2" />
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {imageUploading ? 'Subiendo...' : imageUrl || imageUrls.length > 0 ? `${1 + imageUrls.length} imagen(es) agregada(s) ✓` : 'Haz clic para seleccionar (jpg, png, webp, máx. 2MB). Puedes añadir más después.'}
                      </p>
                    </label>
                    {(imageUrl || imageUrls.length > 0) && (
                      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        Vuelve a elegir un archivo para añadir otra imagen.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={msiMonths != null}
                        onChange={(e) => setMsiMonths(e.target.checked ? 3 : null)}
                        className="rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500"
                      />
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Meses sin intereses (MSI)</span>
                    </label>
                    {msiMonths != null && (
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <label className="text-sm text-gray-600 dark:text-gray-400">Meses:</label>
                        <select
                          value={msiMonths}
                          onChange={(e) => setMsiMonths(parseInt(e.target.value, 10) || null)}
                          className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                        >
                          {[3, 6, 12, 18, 24].map((n) => (
                            <option key={n} value={n}>{n} MSI</option>
                          ))}
                        </select>
                        {formData.discountPrice && (
                          <span className="text-sm font-medium text-violet-600 dark:text-violet-400">
                            {formatPreviewPrice(formData.discountPrice)} ÷ {msiMonths} = {formatPreviewPrice(String(parseDecimalPrice(formData.discountPrice) / msiMonths))}/mes
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-200/80 dark:border-gray-700/80 pt-5 mt-2">
                  <button
                    onClick={() => setShowOptionalSection(!showOptionalSection)}
                    className="flex w-full items-center justify-between rounded-xl bg-gray-50/80 dark:bg-gray-800/50 px-4 py-3.5 transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                  >
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Información adicional (opcional)
                    </span>
                    {showOptionalSection ? (
                      <ChevronUp className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                    )}
                  </button>

                  <AnimatePresence>
                    {showOptionalSection && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="mt-4 space-y-4 overflow-hidden"
                      >
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Pasos para obtener la oferta
                          </label>
                          <textarea
                            value={formData.steps}
                            onChange={(e) => handleInputChange('steps', e.target.value)}
                            placeholder="Ej: 1. Agregar al carrito, 2. Aplicar cupón..."
                            rows={3}
                            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none transition-colors duration-200"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Condiciones
                          </label>
                          <textarea
                            value={formData.conditions}
                            onChange={(e) => handleInputChange('conditions', e.target.value)}
                            placeholder="Ej: Válido hasta el 31 de diciembre, solo en línea..."
                            rows={3}
                            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none transition-colors duration-200"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Cupones o códigos de descuento
                          </label>
                          <input
                            type="text"
                            value={formData.coupons}
                            onChange={(e) => handleInputChange('coupons', e.target.value)}
                            placeholder="Ej: DESCUENTO20"
                            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-violet-50/80 dark:bg-violet-900/20 border border-violet-100/80 dark:border-violet-800/30 p-4">
                  <Info className="h-5 w-5 text-violet-600 dark:text-violet-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-violet-800 dark:text-violet-300">
                    Los campos marcados con * son obligatorios. Verifica que los precios sean correctos antes de publicar.
                  </p>
                </div>
                </div>

                <div
                  className={`flex-1 md:flex-[0_0_55%] lg:flex-[0_0_58%] flex flex-col min-w-0 overflow-y-auto bg-[#F5F5F7] dark:bg-[#1d1d1f] md:border-l border-gray-200/80 dark:border-gray-700/80 ${
                    mobileTab !== 'preview' ? 'hidden md:flex' : 'flex'
                  }`}
                >
                  <div className="p-5 sm:p-6 md:p-8 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-5">
                      Vista previa en vivo
                    </p>
                    <AnimatePresence mode="wait">
                      {(formData.title.trim() || formData.store.trim() || formData.originalPrice || formData.discountPrice) ? (
                        <motion.div
                          key="preview"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                          className="space-y-6"
                        >
                          <div>
                            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-3">En el feed</p>
                            <motion.div
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.05 }}
                              className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 p-3 md:p-4 flex flex-row overflow-hidden shadow-sm"
                            >
                              <div className="w-[35%] min-w-[80px] shrink-0">
                                <div className="h-[100px] md:h-[120px] rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                  {imageUrl ? (
                                    <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <Sparkles className="h-6 w-6 text-gray-400" />
                                  )}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0 pl-4 flex flex-col justify-between">
                                <div>
                                  <div className="flex items-baseline gap-2 flex-wrap">
                                    <span className="text-xl md:text-2xl font-bold text-gray-900 dark:text-gray-100">
                                      {formatPreviewPrice(formData.discountPrice || formData.originalPrice || '0')}
                                    </span>
                                    {hasDiscount && formData.originalPrice && (
                                      <span className="text-sm md:text-base text-gray-500 dark:text-gray-400 line-through">
                                        {formatPreviewPrice(formData.originalPrice)}
                                      </span>
                                    )}
                                    {hasDiscount &&
                                      formData.originalPrice &&
                                      formData.discountPrice &&
                                      (() => {
                                        const orig = parseDecimalPrice(formData.originalPrice);
                                        const disc = parseDecimalPrice(formData.discountPrice);
                                        const pct = orig > 0 ? Math.round((1 - disc / orig) * 100) : 0;
                                        return pct > 0 ? (
                                          <span
                                            className="text-[11px] font-medium px-1.5 py-0.5 rounded"
                                            style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444' }}
                                          >
                                            -{pct}%
                                          </span>
                                        ) : null;
                                      })()}
                                  </div>
                                  <h3 className="text-sm md:text-base font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug mt-0.5">
                                    {formData.title.trim() || 'Título de la oferta'}
                                  </h3>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {formData.store.trim() || 'Tienda'}
                                  </p>
                                </div>
                              </div>
                            </motion.div>
                          </div>
                          <div>
                            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-3">Vista extendida</p>
                            <motion.div
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.08 }}
                              className="rounded-2xl bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700/80 overflow-hidden shadow-sm"
                            >
                              <div className="h-32 md:h-40 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                                {imageUrl ? (
                                  <img src={imageUrl} alt="" className="max-h-full w-auto object-contain" />
                                ) : (
                                  <Sparkles className="h-12 w-12 text-gray-400" />
                                )}
                              </div>
                              <div className="p-4 md:p-5 space-y-3">
                                <p className="text-xs font-medium text-violet-600 dark:text-violet-400 uppercase tracking-wide">
                                  {formData.store.trim() || 'Tienda'}
                                </p>
                                <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                                  {formData.title.trim() || 'Título de la oferta'}
                                </h3>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                                    {formatPreviewPrice(formData.discountPrice || formData.originalPrice || '0')}
                                  </span>
                                  {hasDiscount && formData.originalPrice && (
                                    <span className="text-base text-gray-500 dark:text-gray-400 line-through">
                                      {formatPreviewPrice(formData.originalPrice)}
                                    </span>
                                  )}
                                </div>
                                {formData.description.trim() && (
                                  <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                    {formData.description.trim()}
                                  </p>
                                )}
                              </div>
                            </motion.div>
                          </div>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center justify-center min-h-[280px] rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white/40 dark:bg-gray-800/30"
                        >
                          <Sparkles className="h-14 w-14 text-gray-300 dark:text-gray-500 mb-4" />
                          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 text-center px-6">
                            Escribe título, precio o tienda para ver cómo se verá tu oferta
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                            La vista previa se actualiza en tiempo real
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0 border-t border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-900 px-5 sm:px-6 md:px-8 py-4 sm:py-5">
                <div className="flex gap-3 sm:gap-4">
                  <button
                    onClick={handleCancel}
                    className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-5 py-3.5 text-[15px] font-semibold text-gray-700 dark:text-gray-300 transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 active:scale-[0.99]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!isFormValid() || isSubmitting}
                    className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50 disabled:hover:shadow-lg"
                  >
                    {isSubmitting ? 'Publicando…' : 'Publicar oferta'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
