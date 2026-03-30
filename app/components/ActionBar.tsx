'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Home, Compass, Heart, User, Plus, X, Image as ImageIcon, ChevronDown, ChevronUp, Info, Sparkles, Eye, FileText, Loader2 } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useUI } from '@/app/providers/UIProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { OFFER_CARD_DESCRIPTION_MAX_LENGTH } from '@/app/components/OfferCard';
import { ALL_CATEGORIES } from '@/lib/categories';
import { BANK_COUPON_OPTIONS, getBankCouponLabel } from '@/lib/bankCoupons';
import { storeLikelyHasPhysicalPresence } from '@/lib/storesPhysical';
import { logClientError } from '@/lib/utils/handleError';

function formatThousands(s: string): string {
  const digits = s.replace(/\D/g, '');
  if (digits === '') return '';
  return Number(digits).toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

function parsePriceString(s: string): string {
  return s.replace(/\D/g, '');
}

function parseDecimalPrice(s: string): number {
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function formatPreviewPrice(s: string): string {
  const n = parseDecimalPrice(s);
  const formatted = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
  return `$${formatted}`;
}

const COOLDOWN_SECONDS_DEFAULT = 15;
const COOLDOWN_SECONDS_LEVEL_4 = 5;

export default function ActionBar() {
  useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isOfferOpen, showToast, openRegisterModal, uploadModalRequested, clearUploadModalRequest } = useUI();

  const isActive = (path: string, exact?: boolean) =>
    exact ? pathname === path : pathname.startsWith(path);
  /** Claro: violeta marca. Oscuro: superficie neutra + acento fuchsia (sin violeta/azulado). */
  const activeClasses =
    'text-violet-600 bg-violet-100/80 dark:text-fuchsia-300 dark:bg-[#262626]';
  const inactiveClasses = 'text-[#6e6e73] dark:text-zinc-400';
  const sidebarLinkInactive =
    'text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-[#262626] hover:text-violet-600 dark:hover:text-fuchsia-300';
  const sidebarLinkActive =
    'bg-violet-100 dark:bg-[#262626] text-violet-600 dark:text-fuchsia-300';
  const { session } = useAuth();
  const [reputationLevel, setReputationLevel] = useState(1);
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
    conditions: '',
    coupons: '',
    bank_coupon: '',
    tags: '',
    moderator_comment: '',
  });
  const [stepsList, setStepsList] = useState<string[]>(['']);
  const MAX_STEPS = 20;
  const [hasDiscount, setHasDiscount] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [msiMonths, setMsiMonths] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSubmitThanksModal, setShowSubmitThanksModal] = useState(false);
  const [mobileTab, setMobileTab] = useState<'form' | 'preview'>('form');
  const [urlParseLoading, setUrlParseLoading] = useState(false);
  const prevUrlParseLoadingRef = useRef(false);
  /** Tras pegar el enlace (y parse si hay sesión), se desbloquea el formulario completo. */
  const [uploadLinkGatePassed, setUploadLinkGatePassed] = useState(false);
  const [cooldownExempt, setCooldownExempt] = useState(false);
  /** Solo tiendas con sucursales probables: se guarda en `conditions` al publicar. */
  const [offerScope, setOfferScope] = useState<'online' | 'in_store' | null>(null);

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
    if (uploadModalRequested) {
      setUploadLinkGatePassed(false);
      setShowUploadModal(true);
      clearUploadModalRequest();
    }
  }, [uploadModalRequested, clearUploadModalRequest]);

  useEffect(() => {
    if (!session?.user?.id) {
      setReputationLevel(1);
      setCooldownExempt(false);
      return;
    }
    const supabase = createClient();
    supabase
      .from('profiles')
      .select('reputation_level')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(
        ({ data }) => {
          setReputationLevel(Math.max(1, (data as { reputation_level?: number } | null)?.reputation_level ?? 1));
        },
        () => setReputationLevel(1)
      );
  }, [session?.user?.id]);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) {
      setCooldownExempt(false);
      return;
    }
    fetch('/api/me/upload-cooldown-status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : { exempt: false }))
      .then((data) => setCooldownExempt(Boolean(data?.exempt)))
      .catch((err) => {
        logClientError('actionbar:upload-cooldown-status', err);
        setCooldownExempt(false);
      });
  }, [session?.access_token]);

  // Prefill upload modal from URL params (extension or /subir deep link)
  useEffect(() => {
    if (!showUploadModal || pathname !== '/') return;
    const upload = searchParams.get('upload');
    const title = searchParams.get('title');
    const image = searchParams.get('image');
    const offer_url = searchParams.get('offer_url');
    const store = searchParams.get('store');
    if (upload !== '1' || (!title && !image && !offer_url && !store)) return;
    setFormData((prev) => ({
      ...prev,
      ...(title != null && { title: decodeURIComponent(title) }),
      ...(offer_url != null && { offer_url: decodeURIComponent(offer_url) }),
      ...(store != null && { store: decodeURIComponent(store) }),
    }));
    if (image != null) setImageUrl(decodeURIComponent(image));
    setUploadLinkGatePassed(true);
    router.replace('/', { scroll: false });
  }, [showUploadModal, pathname, searchParams, router]);

  useEffect(() => {
    if (!storeLikelyHasPhysicalPresence(formData.store)) setOfferScope(null);
  }, [formData.store]);

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

  // Parse offer URL for OG metadata and auto-fill title, store, image (no override of existing fields)
  useEffect(() => {
    const url = formData.offer_url.trim();
    if (!url || !url.startsWith('http')) return;
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setUrlParseLoading(true);
      try {
        const res = await fetch('/api/parse-offer-url', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ url }),
        });
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data) {
          setUrlParseLoading(false);
          return;
        }
        setFormData((prev) => {
          if (prev.offer_url.trim() !== url) return prev;
          const sd =
            typeof data.suggested_discount_price === 'number' && data.suggested_discount_price > 0
              ? data.suggested_discount_price
              : null;
          const so =
            typeof data.suggested_original_price === 'number' && data.suggested_original_price > 0
              ? data.suggested_original_price
              : null;
          const next = {
            ...prev,
            ...(data.title && !prev.title.trim() && { title: data.title }),
            ...(data.store && !prev.store.trim() && { store: data.store }),
          };
          const discEmpty = !parseDecimalPrice(prev.discountPrice);
          const origEmpty = !parseDecimalPrice(prev.originalPrice);
          if (hasDiscount) {
            if (sd != null && discEmpty) next.discountPrice = String(sd);
            if (so != null && origEmpty) next.originalPrice = String(so);
          } else if (sd != null && origEmpty) {
            next.originalPrice = String(sd);
          }
          return next;
        });
        if (data.image && !cancelled) setImageUrl(data.image);
      } catch {
        // do nothing; form continues as before
      } finally {
        if (!cancelled) setUrlParseLoading(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [formData.offer_url, session?.access_token, hasDiscount]);

  useEffect(() => {
    if (!showUploadModal || uploadLinkGatePassed) return;
    const u = formData.offer_url.trim();
    if (!u.startsWith('http')) return;
    if (!session?.access_token) return;
    const wasLoading = prevUrlParseLoadingRef.current;
    prevUrlParseLoadingRef.current = urlParseLoading;
    if (!wasLoading || urlParseLoading) return;
    const t = window.setTimeout(() => setUploadLinkGatePassed(true), 350);
    return () => window.clearTimeout(t);
  }, [showUploadModal, uploadLinkGatePassed, formData.offer_url, urlParseLoading, session?.access_token]);

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.size > MAX_IMAGE_SIZE) {
        showToast('La imagen no puede superar 2 MB. Usa una más pequeña o comprímela.');
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
      const nextUrl = data.url;
      const total = (imageUrl ? 1 : 0) + imageUrls.length;
      if (total >= 8) {
        showToast('Máximo 8 fotos por oferta');
        return;
      }
      if (!imageUrl) {
        setImageUrl(nextUrl);
      } else {
        setImageUrls((prev) => (prev.includes(nextUrl) ? prev : [...prev, nextUrl]));
      }
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

  const removeImageAt = (index: number) => {
    const all = [imageUrl, ...imageUrls].filter((u): u is string => Boolean(u));
    if (index < 0 || index >= all.length) return;
    const next = all.filter((_, i) => i !== index);
    setImageUrl(next[0] ?? null);
    setImageUrls(next.slice(1));
  };

  const setCoverImageAt = (index: number) => {
    const all = [imageUrl, ...imageUrls].filter((u): u is string => Boolean(u));
    if (index < 0 || index >= all.length) return;
    const cover = all[index];
    const rest = all.filter((_, i) => i !== index);
    setImageUrl(cover);
    setImageUrls(rest);
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
      conditions: '',
      coupons: '',
      bank_coupon: '',
      tags: '',
      moderator_comment: '',
    });
    setStepsList(['']);
    setShowOptionalSection(false);
    setImageUrl(null);
    setImageUrls([]);
    setMsiMonths(null);
    setOfferScope(null);
    setHasDiscount(true);
    setMobileTab('form');
    setUploadLinkGatePassed(false);
    prevUrlParseLoadingRef.current = false;
  };

  const handleSubmit = async () => {
    if (!isFormValid() || isSubmitting) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setIsSubmitting(true);
    let originalPriceNum = parseDecimalPrice(formData.originalPrice);
    let price = hasDiscount ? parseDecimalPrice(formData.discountPrice) : originalPriceNum;
    if (hasDiscount && originalPriceNum > 0 && price > 0 && price > originalPriceNum) {
      const t = originalPriceNum;
      originalPriceNum = price;
      price = t;
    }
    const dedupImages = [imageUrl, ...imageUrls].filter((u): u is string => Boolean(u)).filter((u, i, arr) => arr.indexOf(u) === i);
    const firstImage = dedupImages[0] ?? '/placeholder.png';
    const extraImages = dedupImages.slice(1);
    let conditionsOut = formData.conditions.trim();
    if (offerScope === 'in_store') {
      const line = 'Alcance: oferta en tienda física / sucursales.';
      conditionsOut = conditionsOut ? `${line}\n\n${conditionsOut}` : line;
    } else if (offerScope === 'online') {
      const line = 'Alcance: compra en línea.';
      conditionsOut = conditionsOut ? `${line}\n\n${conditionsOut}` : line;
    }
    const payload = {
      title: formData.title.trim(),
      price,
      original_price: hasDiscount && formData.originalPrice.trim() ? originalPriceNum : null,
      hasDiscount,
      store: formData.store.trim(),
      ...(formData.category.trim() && { category: formData.category.trim() }),
      image_url: firstImage,
      ...(extraImages.length > 0 && { image_urls: extraImages }),
      ...(msiMonths != null && msiMonths >= 1 && msiMonths <= 24 && { msi_months: msiMonths }),
      ...(formData.offer_url.trim() && { offer_url: formData.offer_url.trim() }),
      ...(formData.description.trim() && { description: formData.description.trim() }),
      ...(stepsList.filter((s) => s.trim()).length > 0 && {
        steps: JSON.stringify(stepsList.map((s) => s.trim()).filter(Boolean)),
      }),
      ...(conditionsOut && { conditions: conditionsOut }),
      ...(formData.coupons.trim() && { coupons: formData.coupons.trim() }),
      ...(formData.bank_coupon.trim() && { bank_coupon: formData.bank_coupon.trim() }),
      ...(formData.tags.trim() && {
        tags: [...new Set(formData.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))],
      }),
      ...(formData.moderator_comment.trim() && { moderator_comment: formData.moderator_comment.trim().slice(0, 500) }),
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
      const firstIssue = Array.isArray(data?.issues) && data.issues.length > 0 ? data.issues[0]?.message : null;
      showToast(firstIssue || data?.error || 'Error al crear la oferta');
      return;
    }
    setShowSubmitThanksModal(true);
    const cooldownSec = cooldownExempt ? 0 : reputationLevel >= 4 ? COOLDOWN_SECONDS_LEVEL_4 : COOLDOWN_SECONDS_DEFAULT;
    setCooldownRemaining(cooldownSec);
    handleCancel();
  };

  return (
    <>
      <div
        className={`md:hidden fixed bottom-0 left-0 right-0 z-50 pb-[calc(0.65rem+env(safe-area-inset-bottom,0px))] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] flex flex-col items-center ${isOfferOpen ? 'opacity-0 translate-y-6 pointer-events-none' : ''}`}
      >
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
            href="/descubre"
            className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl max-[400px]:rounded-xl min-h-[52px] max-[400px]:min-h-[48px] min-w-[64px] max-[400px]:min-w-[56px] px-2 max-[400px]:px-1 py-2 transition-colors duration-300 ease-out active:scale-95 ${isActive('/descubre') ? activeClasses : inactiveClasses}`}
          >
            <Compass className="h-5 w-5 max-[400px]:h-4 max-[400px]:w-4" />
            <span className="text-[10px] max-[400px]:text-[9px] font-semibold">Descubre</span>
          </Link>
          <button
            type="button"
            disabled={cooldownRemaining > 0}
            onClick={() => {
              if (!session) {
                openRegisterModal('signup');
                return;
              }
              setShowSubmitThanksModal(false);
              setUploadLinkGatePassed(false);
              prevUrlParseLoadingRef.current = false;
              setShowUploadModal(true);
            }}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl max-[400px]:rounded-xl min-h-[56px] max-[400px]:min-h-[52px] min-w-[64px] max-[400px]:min-w-[56px] px-2 max-[400px]:px-1 py-2.5 max-[400px]:py-2 transition-all duration-200 active:scale-95 bg-gradient-to-b from-violet-600 to-violet-700 dark:from-fuchsia-600 dark:to-pink-600 text-white shadow-lg shadow-violet-500/25 dark:shadow-fuchsia-950/50 ${cooldownRemaining > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
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
        className={`hidden md:flex fixed left-0 top-0 h-screen w-28 z-50 flex-col items-center py-6 gap-1 bg-white/95 dark:bg-[#141414]/95 backdrop-blur-xl border-r border-[#E5E7EB] dark:border-[#262626] shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.45)] ${isOfferOpen ? 'pointer-events-none' : ''}`}
      >
        <p className="text-[10px] font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-3 px-2">Tus atajos</p>
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] transition-colors duration-300 ease-out ${pathname === '/' ? sidebarLinkActive : sidebarLinkInactive}`}
          aria-label="Inicio"
        >
          <Home className="h-6 w-6" />
          <span className="text-[10px] font-medium">Inicio</span>
        </Link>
        <Link
          href="/descubre"
          className={`flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] transition-colors duration-300 ease-out ${
            pathname.startsWith('/descubre') ? sidebarLinkActive : sidebarLinkInactive
          }`}
          aria-label="Descubre AVENTA"
        >
          <Compass className="h-6 w-6" />
          <span className="text-[10px] font-medium">Descubre</span>
        </Link>
        <button
          type="button"
          disabled={cooldownRemaining > 0}
          onClick={() => {
            if (!session) {
              openRegisterModal('signup');
              return;
            }
            setShowSubmitThanksModal(false);
            setUploadLinkGatePassed(false);
            prevUrlParseLoadingRef.current = false;
            setShowUploadModal(true);
          }}
          className={`flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] transition-all duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${cooldownRemaining > 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#2d2d2f] dark:hover:bg-[#333] active:scale-95'} bg-[#1d1d1f] dark:bg-[#2a2a2a] text-white shadow-lg dark:shadow-black/40 dark:ring-1 dark:ring-fuchsia-500/20`}
          aria-label="Subir oferta"
        >
          <Plus className="h-6 w-6" />
          <span className="text-[10px] font-semibold text-white">Subir</span>
        </button>
        {session ? (
          <>
            <Link
              href="/me/favorites"
              className={`flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] transition-colors duration-300 ease-out ${pathname.startsWith('/me/favorites') ? sidebarLinkActive : sidebarLinkInactive}`}
              aria-label="Favoritos"
            >
              <Heart className="h-6 w-6" />
              <span className="text-[10px] font-medium">Favoritos</span>
            </Link>
            <Link
              href="/me"
              className={`flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] transition-colors duration-300 ease-out ${pathname === '/me' ? sidebarLinkActive : sidebarLinkInactive}`}
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
              className={`flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] transition-colors duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${sidebarLinkInactive}`}
              aria-label="Favoritos"
            >
              <Heart className="h-6 w-6" />
              <span className="text-[10px] font-medium">Favoritos</span>
            </button>
            <button
              type="button"
              onClick={() => showToast('Para acceder hay que iniciar sesión')}
              className={`flex flex-col items-center gap-1 rounded-xl p-3.5 w-full max-w-[4.5rem] transition-colors duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${sidebarLinkInactive}`}
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
                    {uploadLinkGatePassed
                      ? 'Revisa y corrige lo que falte. Solo lo esencial es obligatorio.'
                      : 'Pega el enlace: obtenemos título, imagen y precios cuando el sitio lo permite.'}
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

              {!uploadLinkGatePassed ? (
                <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden bg-white dark:bg-gray-900">
                  {urlParseLoading && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-md px-6">
                      <Loader2 className="h-12 w-12 animate-spin text-violet-600 dark:text-violet-400" aria-hidden />
                      <p className="mt-5 text-sm font-medium text-gray-700 dark:text-gray-300 text-center max-w-xs">
                        Obteniendo datos de la oferta…
                      </p>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center max-w-sm">
                        Esto suele tardar solo un momento.
                      </p>
                    </div>
                  )}
                  <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 overflow-y-auto min-h-[40vh]">
                    <div className="w-full max-w-md mx-auto space-y-5">
                      <div className="text-center sm:text-left space-y-2">
                        <p className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Pega el enlace de tu oferta
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                          Nuestro sistema se encargará de obtener los datos por ti cuando sea posible.
                        </p>
                      </div>
                      <div>
                        <label className="sr-only" htmlFor="upload-offer-url-gate">
                          URL de la oferta
                        </label>
                        <input
                          id="upload-offer-url-gate"
                          type="url"
                          value={formData.offer_url}
                          onChange={(e) => handleInputChange('offer_url', e.target.value)}
                          placeholder="https://…"
                          className="w-full rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800/50 px-4 py-4 text-[16px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200 break-all"
                          autoComplete="url"
                          inputMode="url"
                        />
                      </div>
                      {!session?.access_token ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300/90 text-center sm:text-left leading-snug">
                          Inicia sesión para que podamos leer la página y rellenar título e imagen automáticamente.
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setUploadLinkGatePassed(true)}
                        className="w-full text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline py-1"
                      >
                        Continuar sin enlace
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
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
                  className={`flex-1 md:flex-[0_0_45%] lg:flex-[0_0_42%] overflow-y-auto p-4 sm:p-5 md:p-6 space-y-3 min-w-0 ${
                    mobileTab !== 'form' ? 'hidden md:block' : ''
                  }`}
                >
                  <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Enlace de la oferta (URL)
                      {urlParseLoading && (
                        <span className="ml-2 text-xs font-normal text-violet-600 dark:text-violet-400">
                          Obteniendo datos…
                        </span>
                      )}
                    </label>
                    <input
                      type="url"
                      value={formData.offer_url}
                      onChange={(e) => handleInputChange('offer_url', e.target.value)}
                      placeholder="https://…"
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200 break-all"
                    />
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-snug">
                      Puedes pegar otro enlace aquí si hace falta; volvemos a intentar obtener datos.
                    </p>
                  </div>

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

                  <div className={`grid gap-4 ${hasDiscount ? 'grid-cols-1 sm:grid-cols-2' : ''}`}>
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
                      {ALL_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
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

                  {storeLikelyHasPhysicalPresence(formData.store) && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        ¿Dónde aplica la oferta?
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        Para tiendas con sucursales: indica si es solo en línea o en tienda física.
                      </p>
                      <div className="flex flex-col gap-2.5">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="radio"
                            name="offerScope"
                            checked={offerScope === null}
                            onChange={() => setOfferScope(null)}
                            className="border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">No indicar (opcional)</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="radio"
                            name="offerScope"
                            checked={offerScope === 'online'}
                            onChange={() => setOfferScope('online')}
                            className="border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Compra en línea</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="radio"
                            name="offerScope"
                            checked={offerScope === 'in_store'}
                            onChange={() => setOfferScope('in_store')}
                            className="border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">En tienda / sucursal</span>
                        </label>
                      </div>
                    </div>
                  )}

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
                      Fotos de la oferta
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
                        {imageUploading ? 'Subiendo...' : imageUrl || imageUrls.length > 0 ? `${1 + imageUrls.length} foto(s) agregada(s) ✓` : 'Solo fotos de la oferta (jpg, png, webp, máx. 2MB). Puedes añadir más.'}
                      </p>
                    </label>
                    {(imageUrl || imageUrls.length > 0) && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Toca una foto para ponerla de portada o elimínala.
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                          {[imageUrl, ...imageUrls].filter((u): u is string => Boolean(u)).map((url, idx) => (
                            <div
                              key={`${url}-${idx}`}
                              className={`relative rounded-lg overflow-hidden border ${
                                idx === 0
                                  ? 'border-violet-500 ring-1 ring-violet-500/30'
                                  : 'border-gray-200 dark:border-gray-600'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => setCoverImageAt(idx)}
                                className="block w-full"
                                title={idx === 0 ? 'Portada actual' : 'Poner como portada'}
                              >
                                <img src={url} alt={`Foto ${idx + 1}`} className="h-16 w-full object-cover" />
                              </button>
                              {idx === 0 && (
                                <span className="absolute left-1 top-1 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                  Portada
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => removeImageAt(idx)}
                                className="absolute right-1 top-1 rounded bg-black/60 p-0.5 text-white hover:bg-black/80"
                                aria-label="Eliminar foto"
                                title="Eliminar foto"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
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
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                        <div className="flex flex-wrap items-center gap-3">
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
                        </div>
                        {formData.discountPrice && (
                          <span className="text-sm font-medium text-violet-600 dark:text-violet-400 break-words max-w-full leading-snug">
                            {formatPreviewPrice(formData.discountPrice)} ÷ {msiMonths} ={' '}
                            {formatPreviewPrice(String(parseDecimalPrice(formData.discountPrice) / msiMonths))}
                            /mes
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
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            Paso 1, Paso 2… El usuario los verá en la oferta al dar «Ver más».
                          </p>
                          <div className="space-y-2">
                            {stepsList.map((step, i) => (
                              <div key={i} className="flex gap-2 items-start">
                                <span className="shrink-0 w-7 h-9 flex items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300">
                                  {i + 1}
                                </span>
                                <input
                                  type="text"
                                  value={step}
                                  onChange={(e) => {
                                    const next = [...stepsList];
                                    next[i] = e.target.value;
                                    setStepsList(next);
                                  }}
                                  placeholder={`Descripción del paso ${i + 1}`}
                                  className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-3 py-2.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
                                />
                                {stepsList.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setStepsList((prev) => prev.filter((_, j) => j !== i))}
                                    className="shrink-0 p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    aria-label="Quitar paso"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            ))}
                            {stepsList.length < MAX_STEPS && (
                              <button
                                type="button"
                                onClick={() => setStepsList((prev) => [...prev, ''])}
                                className="flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
                              >
                                <Plus className="h-4 w-4" />
                                Agregar paso
                              </button>
                            )}
                          </div>
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

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Cupón bancario
                          </label>
                          <select
                            value={formData.bank_coupon}
                            onChange={(e) => handleInputChange('bank_coupon', e.target.value)}
                            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
                          >
                            <option value="">Sin cupón bancario</option>
                            {BANK_COUPON_OPTIONS.map((b) => (
                              <option key={b.value} value={b.value}>{b.label}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Etiquetas (opcional)
                          </label>
                          <input
                            type="text"
                            value={formData.tags}
                            onChange={(e) => handleInputChange('tags', e.target.value)}
                            placeholder="Ej: playstation, amazon, smart-tv"
                            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
                          />
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Separa por comas. No reemplaza la categoría macro.
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Comentario para moderadores (opcional)
                          </label>
                          <textarea
                            value={formData.moderator_comment}
                            onChange={(e) => handleInputChange('moderator_comment', e.target.value)}
                            placeholder="Notas para el equipo de moderación..."
                            maxLength={500}
                            rows={2}
                            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none transition-colors duration-200"
                          />
                          {formData.moderator_comment.length > 0 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {formData.moderator_comment.length}/500
                            </span>
                          )}
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
                              className="rounded-2xl bg-white dark:bg-[#141414] border border-[#e5e5e7] dark:border-[#262626] p-2.5 max-[400px]:p-2 md:p-3 flex flex-row overflow-hidden shadow-sm"
                            >
                              <div className="w-[38%] min-w-[100px] max-[400px]:min-w-[90px] md:w-[220px] md:min-w-[220px] shrink-0 flex flex-col gap-2 max-[400px]:gap-1.5">
                                <div className="h-[160px] max-[400px]:h-[136px] md:h-[165px] rounded-xl overflow-hidden bg-[#f5f5f7] dark:bg-[#1a1a1a] flex-shrink-0">
                                  {imageUrl ? (
                                    <img src={imageUrl} alt="" className="w-full h-full object-contain md:object-cover object-center" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Sparkles className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex justify-center">
                                  <span className="text-xs text-gray-400 dark:text-gray-500">↑↓</span>
                                </div>
                              </div>
                              <div className="flex flex-col min-w-0 flex-1 pl-3 max-[400px]:pl-2 md:pl-4 justify-between gap-1.5 max-[400px]:gap-1 md:gap-2 pt-6 max-[400px]:pt-5 md:pt-0">
                                <div className="min-w-0">
                                  <h3 className="text-sm max-[400px]:text-[13px] md:text-base font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 md:line-clamp-3 leading-snug wrap-anywhere">
                                    {formData.title.trim() || 'Título de la oferta'}
                                  </h3>
                                  <div className="flex items-baseline gap-1.5 max-[400px]:gap-1 md:gap-2 flex-wrap mt-1 max-[400px]:mt-0.5 min-w-0">
                                    <span className="text-base max-[400px]:text-sm md:text-xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
                                      {formatPreviewPrice(formData.discountPrice || formData.originalPrice || '0')}
                                    </span>
                                    {hasDiscount && formData.originalPrice && (
                                      <span className="text-xs md:text-sm text-gray-500 dark:text-gray-400 line-through">
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
                                            className="text-[10px] md:text-[11px] font-medium px-1 md:px-1.5 py-0.5 rounded"
                                            style={{ backgroundColor: 'rgba(239,68,68,0.12)', color: '#EF4444' }}
                                          >
                                            -{pct}%
                                          </span>
                                        ) : null;
                                      })()}
                                  </div>
                                  {(msiMonths != null && msiMonths >= 1) || getBankCouponLabel(formData.bank_coupon) ? (
                                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                      {msiMonths != null && msiMonths >= 1 && (
                                        <span className="inline-flex items-baseline gap-1 text-[10px] md:text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                          <span className="uppercase tracking-wide">msi</span>
                                          <span>{msiMonths}</span>
                                        </span>
                                      )}
                                      {getBankCouponLabel(formData.bank_coupon) && (
                                        <span className="text-[10px] md:text-xs font-semibold text-blue-600 dark:text-blue-400">
                                          de cupón
                                        </span>
                                      )}
                                    </div>
                                  ) : null}
                                  <p className="text-[11px] md:text-xs mt-0.5 min-w-0 truncate">
                                    <span className="font-semibold text-pink-600 dark:text-pink-400">
                                      {formData.store.trim() || 'Tienda'}
                                    </span>
                                  </p>
                                  <p className="text-[11px] md:text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2 min-h-10 leading-snug wrap-anywhere">
                                    {formData.description.trim() ? (
                                      formData.description.trim()
                                    ) : (
                                      <span className="text-gray-400 dark:text-gray-500 italic">Sin descripción breve</span>
                                    )}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 max-[400px]:gap-1.5 mt-2 max-[400px]:mt-1.5 md:mt-auto md:pt-1.5">
                                  <span className="flex-1 rounded-xl border-2 border-violet-600 dark:border-violet-500 px-3 py-2.5 text-xs md:text-sm font-semibold text-violet-600 dark:text-violet-400 text-center">
                                    Cazar oferta
                                  </span>
                                  <span className="flex-1 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white text-center">
                                    Ir directo
                                  </span>
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
                </>
              )}

              <div className="flex-shrink-0 border-t border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-gray-900 px-5 sm:px-6 md:px-8 py-4 sm:py-5">
                <div className="flex gap-3 sm:gap-4">
                  <button
                    onClick={handleCancel}
                    className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-5 py-3.5 text-[15px] font-semibold text-gray-700 dark:text-gray-300 transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 active:scale-[0.99]"
                  >
                    Cancelar
                  </button>
                  {uploadLinkGatePassed ? (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!isFormValid() || isSubmitting || imageUploading}
                      className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50 disabled:hover:shadow-lg"
                    >
                      {imageUploading ? 'Subiendo foto…' : isSubmitting ? 'Publicando…' : 'Publicar oferta'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setUploadLinkGatePassed(true)}
                      className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500 px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:opacity-95 active:scale-[0.99]"
                    >
                      Continuar al formulario
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {typeof document !== 'undefined' &&
        showSubmitThanksModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-thanks-title"
          >
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl p-6 md:p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40">
                <Sparkles className="h-7 w-7 text-violet-600 dark:text-violet-400" aria-hidden />
              </div>
              <h2
                id="submit-thanks-title"
                className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight"
              >
                ¡Gracias por compartir!
              </h2>
              <p className="mt-3 text-sm md:text-[15px] text-gray-600 dark:text-gray-400 leading-relaxed">
                Tu oferta entrará a la cola de moderación. El equipo la revisa para mantener precios claros,
                enlaces válidos y un buen nivel para toda la comunidad. En cuanto sea aprobada, aparecerá en el
                feed.
              </p>
              <button
                type="button"
                onClick={() => setShowSubmitThanksModal(false)}
                className="mt-6 w-full rounded-xl bg-violet-600 dark:bg-violet-500 px-5 py-3 text-[15px] font-semibold text-white hover:bg-violet-700 dark:hover:bg-violet-600 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
