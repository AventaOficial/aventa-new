'use client';

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Home, Compass, Heart, User, Plus, X, Image as ImageIcon, ChevronDown, ChevronUp, Info, Sparkles, Eye, FileText, Loader2, Link2, Monitor, Store, ArrowRight, MessagesSquare } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from '@/app/providers/ThemeProvider';
import { useUI } from '@/app/providers/UIProvider';
import { useAuth } from '@/app/providers/AuthProvider';
import { createClient } from '@/lib/supabase/client';
import { ALL_CATEGORIES } from '@/lib/categories';
import { BANK_COUPON_OPTIONS, formatCupónBancarioDisplay, getBankCouponLabel } from '@/lib/bankCoupons';
import { describeOfferIssue, OFFER_MAX_IMAGES } from '@/lib/contracts/offers';
import { selectOfferImages } from '@/lib/offers/selectOfferImages';
import { logClientError } from '@/lib/utils/handleError';
import { normalizePastedOfferUrl } from '@/lib/offerUrl';
import { refreshSessionIfNeeded } from '@/lib/supabase/refreshSessionIfNeeded';
import OfferCard from './OfferCard';
import StoreBrandMark from './StoreBrandMark';
import CatalogGapsBoard from './CatalogGapsBoard';
import AventaIcon from './AventaIcon';
import SidebarProgressCard from './SidebarProgressCard';

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

function isOnlineOfferUrl(raw: string): boolean {
  try {
    const url = new URL(raw.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
  } catch {
    return false;
  }
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
  const [reputationScore, setReputationScore] = useState(0);
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
  const [submitThanksApproved, setSubmitThanksApproved] = useState(false);
  const [mobileTab, setMobileTab] = useState<'form' | 'preview'>('form');
  const [urlParseLoading, setUrlParseLoading] = useState(false);
  const [urlParseStatus, setUrlParseStatus] = useState<string | null>(null);
  const [urlParseKind, setUrlParseKind] = useState<'ok' | 'invalid_url' | 'extract_failed' | null>(null);
  /** En móvil: 1 = lo que Aventa encontró, 2 = completar y publicar. Desktop ignora y muestra todo. */
  const [uploadStep, setUploadStep] = useState<1 | 2>(1);
  const prevUrlParseLoadingRef = useRef(false);
  /** Tras pegar el enlace (y parse si hay sesión), se desbloquea el formulario completo. */
  const [uploadLinkGatePassed, setUploadLinkGatePassed] = useState(false);
  const [cooldownExempt, setCooldownExempt] = useState(false);
  /** Alcance en línea vs tienda; se guarda en `conditions` al publicar. */
  const [offerScope, setOfferScope] = useState<'online' | 'in_store' | 'both' | null>(null);
  /** Evita que la inferencia por URL sobrescriba una elección explícita. */
  const offerScopeManuallySelectedRef = useRef(false);
  const [showCouponSection, setShowCouponSection] = useState(false);
  const imageGalleryRef = useRef<{ cover: string | null; extras: string[] }>({ cover: null, extras: [] });
  /** Campos editados a mano; el parse no los sobrescribe. */
  const userEditedFieldsRef = useRef<Set<string>>(new Set());
  /** true si el usuario tocó la galería (subir / quitar / portada). */
  const imagesUserEditedRef = useRef(false);

  useEffect(() => {
    imageGalleryRef.current = { cover: imageUrl, extras: imageUrls };
  }, [imageUrl, imageUrls]);

  useEffect(() => {
    if (offerScopeManuallySelectedRef.current) return;
    setOfferScope(isOnlineOfferUrl(formData.offer_url) ? 'online' : null);
  }, [formData.offer_url]);

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
      setReputationScore(0);
      setCooldownExempt(false);
      return;
    }
    const supabase = createClient();
    supabase
      .from('profiles')
      .select('reputation_level, reputation_score')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(
        ({ data }) => {
          setReputationLevel(Math.max(1, (data as { reputation_level?: number } | null)?.reputation_level ?? 1));
          setReputationScore(Math.max(0, (data as { reputation_score?: number } | null)?.reputation_score ?? 0));
        },
        () => {
          setReputationLevel(1);
          setReputationScore(0);
        }
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
    if (cooldownRemaining <= 0) return;
    const id = setInterval(() => {
      setCooldownRemaining((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [cooldownRemaining]);

  const handleInputChange = (field: string, value: string) => {
    if (field !== 'offer_url') {
      userEditedFieldsRef.current.add(field);
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Parse URL → rellena campos AUTO. No pisa lo marcado como editado por el usuario.
  useEffect(() => {
    if (!showUploadModal) return;
    const url = normalizePastedOfferUrl(formData.offer_url);
    if (!url || !url.startsWith('http')) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setUrlParseLoading(true);
      setUrlParseStatus('Leyendo la página…');
      setUrlParseKind(null);
      try {
        const supabase = createClient();
        let activeSession = session;
        if (!activeSession?.access_token) {
          const { data: { session: s } } = await supabase.auth.getSession();
          activeSession = s;
        }
        if (!activeSession?.access_token) {
          if (!cancelled) {
            setUrlParseKind('extract_failed');
            setUrlParseStatus('Inicia sesión para que podamos leer la página y rellenar los datos.');
          }
          return;
        }

        const fetchParse = (accessToken: string) =>
          fetch('/api/parse-offer-url', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ url }),
          });

        let refreshed = await refreshSessionIfNeeded(supabase, activeSession);
        let activeToken = refreshed?.access_token ?? activeSession.access_token;
        let res = await fetchParse(activeToken);
        if (res.status === 401) {
          const { data: { session: s } } = await supabase.auth.getSession();
          refreshed = await refreshSessionIfNeeded(supabase, s);
          if (refreshed?.access_token) {
            activeToken = refreshed.access_token;
            res = await fetchParse(activeToken);
          }
        }
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data) {
          if (data?.reason === 'invalid_url') {
            setUrlParseKind('invalid_url');
            setUrlParseStatus('Este enlace no es válido. Revisa que sea una URL de tienda (https://…).');
            return;
          }
          if (typeof data?.error === 'string' && res.status !== 500 && res.status !== 502) {
            setUrlParseKind('extract_failed');
            setUrlParseStatus(data.error);
            return;
          }
          setUrlParseKind('extract_failed');
          setUrlParseStatus(
            'No pudimos obtener automáticamente la información de esta tienda. Completa los datos y puedes publicar igual.',
          );
          return;
        }
        if (data.reason === 'invalid_url') {
          setUrlParseKind('invalid_url');
          setUrlParseStatus('Este enlace no es válido. Revisa que sea una URL de tienda (https://…).');
          return;
        }
        const edited = userEditedFieldsRef.current;
        const disc =
          typeof data.suggested_discount_price === 'number' && data.suggested_discount_price > 0
            ? String(data.suggested_discount_price)
            : null;
        const orig =
          typeof data.suggested_original_price === 'number' && data.suggested_original_price > 0
            ? String(data.suggested_original_price)
            : null;
        setFormData((prev) => {
          if (prev.offer_url.trim() !== url) return prev;
          const next = { ...prev };
          if (!edited.has('title')) {
            next.title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : '';
          }
          if (!edited.has('store')) {
            next.store = typeof data.store === 'string' && data.store.trim() ? data.store.trim() : '';
          }
          if (!edited.has('category')) {
            next.category =
              typeof data.suggested_category === 'string' && data.suggested_category.trim()
                ? data.suggested_category.trim()
                : '';
          }
          // Precio actual / anterior: actualizar auto; NUNCA inventar original = discount.
          if (!edited.has('discountPrice') && !edited.has('originalPrice')) {
            if (disc && orig) {
              next.discountPrice = disc;
              next.originalPrice = orig;
            } else if (disc && !orig) {
              // Un solo precio → campo único del form (sin “antes”).
              next.originalPrice = disc;
              next.discountPrice = '';
            } else if (!disc && orig) {
              next.originalPrice = orig;
              next.discountPrice = '';
            } else {
              next.discountPrice = '';
              next.originalPrice = '';
            }
          } else {
            if (!edited.has('discountPrice')) next.discountPrice = disc ?? '';
            if (!edited.has('originalPrice')) next.originalPrice = orig ?? '';
          }
          return next;
        });
        if (disc && orig && Number(orig) > Number(disc)) {
          setHasDiscount(true);
        } else if (!edited.has('originalPrice') && !edited.has('discountPrice')) {
          setHasDiscount(Boolean(disc && orig && Number(orig) > Number(disc)));
        }
        const parsedImages = Array.isArray(data.images)
          ? (data.images as unknown[]).filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
          : [];
        if (data.image && typeof data.image === 'string' && !parsedImages.includes(data.image)) {
          parsedImages.unshift(data.image);
        }
        if (!cancelled && !imagesUserEditedRef.current) {
          // URL nueva → galería de esta URL (sin residuales de la anterior).
          const preferred = typeof data.image === 'string' ? data.image : parsedImages[0] || null;
          const gallery = selectOfferImages(parsedImages, { preferredCover: preferred });
          setImageUrl(gallery[0] ?? null);
          setImageUrls(gallery.slice(1));
        }
        const bits: string[] = [];
        if (data.title) bits.push('título');
        if (parsedImages.length > 0) bits.push(`${Math.min(parsedImages.length, OFFER_MAX_IMAGES)} foto${parsedImages.length > 1 ? 's' : ''}`);
        if (typeof data.suggested_discount_price === 'number') bits.push('precio');
        if (data.suggested_category) bits.push('categoría');
        if (data.reason === 'extract_failed' || bits.length === 0) {
          setUrlParseKind('extract_failed');
          setUrlParseStatus(
            typeof data.error === 'string' && data.error.trim()
              ? data.error
              : 'No pudimos obtener automáticamente la información de esta tienda. Completa los datos y puedes publicar igual.',
          );
        } else {
          setUrlParseKind('ok');
          setUrlParseStatus(`Listo: ${bits.join(', ')}. Revisa y completa lo que falte.`);
        }
      } catch {
        if (!cancelled) setUrlParseStatus('No pudimos obtener automáticamente la información de esta tienda. Completa los datos y puedes publicar igual.');
        if (!cancelled) setUrlParseKind('extract_failed');
      } finally {
        if (!cancelled) setUrlParseLoading(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [showUploadModal, formData.offer_url, session]);

  useEffect(() => {
    if (!showUploadModal || uploadLinkGatePassed) return;
    const u = normalizePastedOfferUrl(formData.offer_url);
    if (!u.startsWith('http')) return;
    if (!session?.access_token) return;
    const wasLoading = prevUrlParseLoadingRef.current;
    prevUrlParseLoadingRef.current = urlParseLoading;
    if (!wasLoading || urlParseLoading) return;
    if (urlParseKind !== 'ok') return;
    const t = window.setTimeout(() => setUploadLinkGatePassed(true), 350);
    return () => window.clearTimeout(t);
  }, [showUploadModal, uploadLinkGatePassed, formData.offer_url, urlParseLoading, urlParseKind, session?.access_token]);

  const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    try {
      if (!session?.access_token) {
        showToast('Inicia sesión para subir imágenes');
        return;
      }
      setImageUploading(true);
      let cover = imageUrl;
      let extras = [...imageUrls];
      for (const file of files) {
        if (file.size > MAX_IMAGE_SIZE) {
          showToast('La imagen no puede superar 2 MB. Usa una más pequeña o comprímela.');
          continue;
        }
        const mime = file.type?.toLowerCase() ?? '';
        if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
          showToast('Solo jpg, jpeg, png o webp');
          continue;
        }
        const body = new FormData();
        body.append('file', file);
        const res = await fetch('/api/upload-offer-image', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
          body,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(data?.error ?? 'Error al subir');
          continue;
        }
        if (typeof data?.url !== 'string') continue;
        const nextUrl = data.url;
        const total = (cover ? 1 : 0) + extras.length;
        if (total >= OFFER_MAX_IMAGES) {
          showToast('Puedes agregar un máximo de 8 imágenes');
          break;
        }
        if (!cover) cover = nextUrl;
        else if (!extras.includes(nextUrl)) extras = [...extras, nextUrl];
      }
      setImageUrl(cover);
      setImageUrls(extras);
      imagesUserEditedRef.current = true;
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
    imagesUserEditedRef.current = true;
    setImageUrl(next[0] ?? null);
    setImageUrls(next.slice(1));
  };

  const setCoverImageAt = (index: number) => {
    const all = [imageUrl, ...imageUrls].filter((u): u is string => Boolean(u));
    if (index < 0 || index >= all.length) return;
    const cover = all[index];
    const rest = all.filter((_, i) => i !== index);
    imagesUserEditedRef.current = true;
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
    setShowCouponSection(false);
    setImageUrl(null);
    setImageUrls([]);
    setMsiMonths(null);
    setOfferScope(null);
    offerScopeManuallySelectedRef.current = false;
    userEditedFieldsRef.current = new Set();
    imagesUserEditedRef.current = false;
    setHasDiscount(true);
    setMobileTab('form');
    setUploadLinkGatePassed(false);
    setUploadStep(1);
    setUrlParseStatus(null);
    setUrlParseKind(null);
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
    const dedupImages = selectOfferImages(
      [imageUrl, ...imageUrls].filter((u): u is string => Boolean(u)),
      { preferredCover: imageUrl },
    );
    const firstImage = dedupImages[0] ?? '/placeholder.png';
    const extraImages = dedupImages.slice(1);
    let conditionsOut = formData.conditions.trim();
    if (offerScope === 'in_store') {
      const line = 'Alcance: oferta en tienda física / sucursales.';
      conditionsOut = conditionsOut ? `${line}\n\n${conditionsOut}` : line;
    } else if (offerScope === 'online') {
      const line = 'Alcance: compra en línea.';
      conditionsOut = conditionsOut ? `${line}\n\n${conditionsOut}` : line;
    } else if (offerScope === 'both') {
      const line = 'Alcance: en línea y en tienda física.';
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
      const firstIssue =
        Array.isArray(data?.issues) && data.issues.length > 0
          ? describeOfferIssue(data.issues[0])
          : null;
      showToast(firstIssue || data?.error || 'No se pudo publicar. Revisa los datos e inténtalo de nuevo.');
      return;
    }
    setSubmitThanksApproved(data?.status === 'approved');
    setShowSubmitThanksModal(true);
    if (typeof window !== 'undefined') {
      const hunterName =
        (typeof session?.user?.user_metadata?.display_name === 'string' &&
          session.user.user_metadata.display_name.trim()) ||
        session?.user?.email?.split('@')[0] ||
        'Tú';
      const publishedOffer =
        data?.status === 'approved' && typeof data?.id === 'string'
          ? {
              id: data.id as string,
              title: formData.title.trim(),
              brand: formData.store.trim(),
              originalPrice: hasDiscount && originalPriceNum > 0 ? originalPriceNum : price,
              discountPrice: price,
              discount:
                hasDiscount && originalPriceNum > 0 && price > 0
                  ? Math.round((1 - price / originalPriceNum) * 100)
                  : 0,
              description: formData.description.trim() || undefined,
              coupons: formData.coupons.trim() || undefined,
              upvotes: 0,
              downvotes: 0,
              offerUrl: formData.offer_url.trim(),
              image: firstImage,
              imageUrls: extraImages,
              votes: { up: 0, down: 0, score: 0 },
              author: {
                username: hunterName,
                avatar_url:
                  typeof session?.user?.user_metadata?.avatar_url === 'string'
                    ? session.user.user_metadata.avatar_url
                    : null,
                userId: session?.user?.id ?? null,
              },
              ranking_momentum: 0,
              createdAt: new Date().toISOString(),
              bankCoupon: formData.bank_coupon.trim() || null,
              msiMonths: msiMonths,
            }
          : null;
      window.dispatchEvent(
        new CustomEvent('aventa:offer-published', {
          detail: { id: data?.id, status: data?.status, offer: publishedOffer },
        }),
      );
    }
    const cooldownSec = cooldownExempt ? 0 : reputationLevel >= 4 ? COOLDOWN_SECONDS_LEVEL_4 : COOLDOWN_SECONDS_DEFAULT;
    setCooldownRemaining(cooldownSec);
    handleCancel();
  };

  const isPanelRoute = pathname.startsWith('/admin') || pathname.startsWith('/equipo');
  if (isPanelRoute && !showUploadModal) {
    return null;
  }

  return (
    <>
      <div
        className={`aventa-public-tabbar md:hidden fixed bottom-0 left-0 right-0 z-50 pb-[calc(0.65rem+env(safe-area-inset-bottom,0px))] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,0.61,0.36,1)] flex flex-col items-center ${isOfferOpen ? 'opacity-0 translate-y-6 pointer-events-none' : ''}`}
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
            <span className="text-[10px] max-[400px]:text-[9px] font-semibold">Guía</span>
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
              setUploadStep(1);
              setMobileTab('form');
              setUrlParseStatus(null);
              setUrlParseKind(null);
              prevUrlParseLoadingRef.current = false;
              setShowUploadModal(true);
            }}
            className={`flex flex-col items-center justify-center gap-0.5 rounded-2xl max-[400px]:rounded-xl min-h-[56px] max-[400px]:min-h-[52px] min-w-[64px] max-[400px]:min-w-[56px] px-2 max-[400px]:px-1 py-2.5 max-[400px]:py-2 transition-all duration-200 active:scale-95 bg-gradient-to-b from-violet-600 to-violet-700 dark:from-violet-600 dark:to-purple-700 text-white shadow-lg shadow-violet-500/25 dark:shadow-violet-950/50 ${cooldownRemaining > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
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
        className={`aventa-desktop-sidebar hidden md:flex fixed left-0 top-0 h-screen w-56 z-50 flex-col px-3 py-5 bg-white dark:bg-[#141414] border-r border-[#E5E7EB] dark:border-[#262626] ${isOfferOpen ? 'pointer-events-none' : ''}`}
      >
        <Link href="/" className="mb-6 flex items-center gap-2 px-2" aria-label="AVENTA inicio">
          <AventaIcon size={22} className="text-[#1d1d1f] dark:text-white shrink-0" />
          <span className="text-[15px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white">AVENTA</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
        <Link
          href="/"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${pathname === '/' ? sidebarLinkActive : sidebarLinkInactive}`}
        >
          <Home className="h-5 w-5 shrink-0" />
          Inicio
        </Link>
        <Link
          href="/descubre"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
            pathname.startsWith('/descubre') ? sidebarLinkActive : sidebarLinkInactive
          }`}
        >
          <Compass className="h-5 w-5 shrink-0" />
          Guía
        </Link>
        <Link
          href="/plaza"
          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${pathname.startsWith('/plaza') ? sidebarLinkActive : sidebarLinkInactive}`}
        >
          <MessagesSquare className="h-5 w-5 shrink-0" />
          Plaza
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
            setUploadStep(1);
            setMobileTab('form');
            setUrlParseStatus(null);
            setUrlParseKind(null);
            prevUrlParseLoadingRef.current = false;
            setShowUploadModal(true);
          }}
          className={`mt-1 flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 dark:bg-violet-600 dark:hover:bg-violet-500 ${cooldownRemaining > 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <Plus className="h-5 w-5" />
          Subir oferta
        </button>
        {session ? (
          <>
            <Link
              href="/me/favorites"
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${pathname.startsWith('/me/favorites') ? sidebarLinkActive : sidebarLinkInactive}`}
            >
              <Heart className="h-5 w-5 shrink-0" />
              Favoritos
            </Link>
            <Link
              href="/me"
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${pathname === '/me' ? sidebarLinkActive : sidebarLinkInactive}`}
            >
              <User className="h-5 w-5 shrink-0" />
              Perfil
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => showToast('Para acceder hay que iniciar sesión')}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${sidebarLinkInactive}`}
            >
              <Heart className="h-5 w-5 shrink-0" />
              Favoritos
            </button>
            <button
              type="button"
              onClick={() => showToast('Para acceder hay que iniciar sesión')}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${sidebarLinkInactive}`}
            >
              <User className="h-5 w-5 shrink-0" />
              Perfil
            </button>
          </>
        )}
        </nav>
        <SidebarProgressCard loggedIn={!!session} level={reputationLevel} score={reputationScore} />
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
              className="relative z-10 w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-7xl sm:rounded-3xl overflow-hidden bg-white dark:bg-[#141414] shadow-2xl flex flex-col"
            >
              <div className="flex-shrink-0 flex items-center justify-between px-5 sm:px-8 py-4 sm:py-5 border-b border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-[#141414]">
                <div>
                  <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight">
                    Comparte una oferta
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                    {uploadLinkGatePassed
                      ? 'Sube la oferta que cazaste para la comunidad'
                      : 'Pega el enlace: rellenamos título, fotos, precios y categoría cuando el sitio lo permite.'}
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
                <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden bg-white dark:bg-[#141414]">
                  {urlParseLoading && (
                    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/95 dark:bg-[#141414]/95 backdrop-blur-md px-6">
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
                          className="w-full rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-[#1a1a1a]/50 px-4 py-4 text-[16px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200 break-all"
                          autoComplete="url"
                          inputMode="url"
                        />
                      </div>
                      {urlParseStatus ? (
                        <p
                          className={`rounded-lg px-3 py-2 text-xs leading-snug ${
                            urlParseKind === 'invalid_url' || urlParseKind === 'extract_failed'
                              ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
                              : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                          }`}
                        >
                          {urlParseStatus}
                        </p>
                      ) : null}
                      {!session?.access_token ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300/90 text-center sm:text-left leading-snug">
                          Inicia sesión para que podamos leer la página y rellenar título e imagen automáticamente.
                        </p>
                      ) : null}
                      <CatalogGapsBoard
                        variant="compact"
                        title="Ideas de qué buscar"
                        showCta={false}
                      />
                      <button
                        type="button"
                        onClick={() => setUploadLinkGatePassed(true)}
                        disabled={urlParseLoading}
                        className="w-full text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline py-1 disabled:opacity-50 disabled:no-underline"
                      >
                        Continuar sin enlace
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
              <div className="hidden md:flex flex-shrink-0 items-center gap-3 px-8 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-[#141414]">
                <span className="text-sm font-semibold text-violet-600">1. Completar</span>
                <span className="h-px flex-1 bg-violet-200 dark:bg-violet-900" />
                <span className="text-sm font-medium text-gray-400">2. Vista previa</span>
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

              {mobileTab === 'form' ? (
                <div className="md:hidden flex-shrink-0 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2.5 bg-violet-50/60 dark:bg-violet-950/20">
                  <button
                    type="button"
                    onClick={() => setUploadStep(1)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      uploadStep === 1
                        ? 'bg-violet-600 text-white'
                        : 'bg-white dark:bg-[#1a1a1a] text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    1 · Encontrado
                  </button>
                  <span className="text-gray-300 dark:text-gray-600">→</span>
                  <button
                    type="button"
                    onClick={() => setUploadStep(2)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      uploadStep === 2
                        ? 'bg-violet-600 text-white'
                        : 'bg-white dark:bg-[#1a1a1a] text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    2 · Completar
                  </button>
                </div>
              ) : null}

              <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden bg-white dark:bg-[#141414]">
                <div
                  className={`flex-1 md:flex-[0_0_45%] lg:flex-[0_0_42%] overflow-y-auto p-4 sm:p-5 md:p-6 space-y-3 min-w-0 bg-white dark:bg-[#141414] ${
                    mobileTab !== 'form' ? 'hidden md:block' : ''
                  }`}
                >
                  <div className="space-y-6">
                  <section className={`space-y-4 ${uploadStep === 1 ? '' : 'hidden md:block'}`}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                      Lo que encontramos
                    </p>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Enlace de la oferta
                      {urlParseLoading && (
                        <span className="ml-2 text-xs font-normal text-violet-600 dark:text-violet-400">
                          Obteniendo datos…
                        </span>
                      )}
                    </label>
                    <div className="relative">
                      <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="url"
                        value={formData.offer_url}
                        onChange={(e) => handleInputChange('offer_url', e.target.value)}
                        placeholder="https://…"
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1a1a1a]/50 pl-10 pr-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200 break-all"
                      />
                    </div>
                    {urlParseStatus ? (
                      <p
                        className={`mt-2 rounded-lg px-3 py-2 text-xs leading-snug ${
                          urlParseKind === 'invalid_url' || urlParseKind === 'extract_failed'
                            ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
                            : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                        }`}
                      >
                        {urlParseStatus}
                      </p>
                    ) : (
                      <p className="mt-2 rounded-lg bg-violet-50 dark:bg-violet-950/40 px-3 py-2 text-xs text-violet-800 dark:text-violet-300 leading-snug">
                        Detectamos título, fotos, precios y categoría cuando el sitio lo permite. Siempre puedes corregirlos.
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Imágenes encontradas
                      </p>
                      <span className="text-[11px] text-gray-400">
                        {(imageUrl ? 1 : 0) + imageUrls.length}/{OFFER_MAX_IMAGES}
                      </span>
                    </div>
                    {urlParseLoading && !imageUrl && imageUrls.length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">Buscando fotos del producto…</p>
                    ) : (
                      <>
                        <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                          {imageUrl || imageUrls.length > 0
                            ? 'Toca una foto para usarla de portada. Puedes quitar las que no sirvan.'
                            : 'Aún no hay fotos. Añade al menos una si las tienes.'}
                        </p>
                        <div className="grid grid-cols-4 gap-2">
                          {[imageUrl, ...imageUrls]
                            .filter((u): u is string => Boolean(u))
                            .map((url, idx) => (
                              <div
                                key={`${url}-${idx}`}
                                className={`relative overflow-hidden rounded-lg border ${
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
                          {(imageUrl ? 1 : 0) + imageUrls.length < OFFER_MAX_IMAGES ? (
                            <label className="flex h-16 min-h-16 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-violet-200 bg-violet-50/50 text-violet-600 dark:border-violet-800 dark:bg-violet-950/20 dark:text-violet-300">
                              <input
                                type="file"
                                accept="image/jpeg,image/jpg,image/png,image/webp"
                                multiple
                                onChange={handleImageSelect}
                                disabled={imageUploading}
                                className="hidden"
                              />
                              <ImageIcon className="h-4 w-4" />
                              <span className="mt-0.5 text-[10px] font-medium">
                                {imageUploading ? 'Subiendo' : 'Añadir'}
                              </span>
                            </label>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                          Título de la oferta *
                        </label>
                        <span className="text-[11px] text-gray-400">{formData.title.length}/120</span>
                      </div>
                      <textarea
                        value={formData.title}
                        onChange={(e) => handleInputChange('title', e.target.value.slice(0, 120))}
                        placeholder="Ej: iPhone 15 Pro Max 256GB"
                        rows={2}
                        className="w-full min-h-[4.25rem] rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1a1a1a]/50 px-4 py-3.5 text-[15px] leading-snug text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200 resize-y break-words whitespace-pre-wrap"
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

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Precio</label>
                      {hasDiscount &&
                        formData.originalPrice &&
                        formData.discountPrice &&
                        (() => {
                          const orig = parseDecimalPrice(formData.originalPrice);
                          const disc = parseDecimalPrice(formData.discountPrice);
                          const pct = orig > 0 ? Math.round((1 - disc / orig) * 100) : 0;
                          return pct > 0 ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              {pct}% OFF
                            </span>
                          ) : null;
                        })()}
                    </div>
                    <div className={`grid gap-3 items-center ${hasDiscount ? 'grid-cols-1 sm:grid-cols-[1fr_auto_1fr]' : ''}`}>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Precio original *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={formData.originalPrice}
                        onChange={(e) => handleInputChange('originalPrice', e.target.value)}
                        placeholder="$0"
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1a1a1a]/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
                      />
                    </div>
                    {hasDiscount && (
                      <>
                      <ArrowRight className="hidden sm:block h-4 w-4 text-gray-400 justify-self-center" />
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Precio con descuento *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={formData.discountPrice}
                          onChange={(e) => handleInputChange('discountPrice', e.target.value)}
                          placeholder="$0"
                          className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1a1a1a]/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
                        />
                      </div>
                      </>
                    )}
                    </div>
                  </div>
                  </section>

                  <section className={`space-y-4 ${uploadStep === 1 ? '' : 'hidden md:block'}`}>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Categoría *
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => handleInputChange('category', e.target.value)}
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1a1a1a]/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 focus:border-violet-500 focus:bg-white dark:focus:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
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
                      placeholder="Ej: Amazon, Mercado Libre"
                      className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1a1a1a]/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
                    />
                  </div>
                  </section>

                  {uploadStep === 1 ? (
                    <button
                      type="button"
                      onClick={() => setUploadStep(2)}
                      className="md:hidden min-h-12 w-full rounded-xl bg-violet-600 px-4 py-3.5 text-sm font-semibold text-white hover:bg-violet-500"
                    >
                      Continuar
                    </button>
                  ) : null}

                  <section className={`space-y-4 ${uploadStep === 2 ? '' : 'hidden md:block'}`}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                      Completar y publicar
                    </p>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Descripción
                      </label>
                      <span className="text-[11px] text-gray-400">{formData.description.length}/300</span>
                    </div>
                    <textarea
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value.slice(0, 300))}
                      placeholder="Describe brevemente la oferta..."
                      rows={4}
                      className="w-full min-h-[6.5rem] rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1a1a1a]/50 px-4 py-3.5 text-[15px] leading-snug text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-y break-words whitespace-pre-wrap transition-colors duration-200"
                    />
                  </div>

                  <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        ¿Dónde aplica la oferta?
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {(
                          [
                            { id: 'online' as const, label: 'Compra en línea', Icon: Monitor },
                            { id: 'in_store' as const, label: 'En tienda física', Icon: Store },
                            { id: 'both' as const, label: 'Ambas opciones', Icon: Sparkles },
                          ] as const
                        ).map(({ id, label, Icon }) => {
                          const selected = offerScope === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => {
                                offerScopeManuallySelectedRef.current = true;
                                setOfferScope(id);
                              }}
                              className={`rounded-xl border px-3 py-3 text-left text-sm transition-colors ${
                                selected
                                  ? 'border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200'
                                  : 'border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              <Icon className="mb-1 h-4 w-4" />
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                  <button
                    type="button"
                    onClick={() => setShowCouponSection((v) => !v)}
                    className="text-sm font-medium text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    {showCouponSection ? 'Ocultar cupón' : '+ Agregar cupón de descuento (opcional)'}
                  </button>
                  {showCouponSection ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        value={formData.coupons}
                        onChange={(e) => handleInputChange('coupons', e.target.value)}
                        placeholder="Código (ej. DESCUENTO20)"
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1a1a1a]/50 px-4 py-3 text-[15px] text-gray-900 dark:text-gray-100"
                      />
                      <select
                        value={formData.bank_coupon}
                        onChange={(e) => handleInputChange('bank_coupon', e.target.value)}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1a1a1a]/50 px-4 py-3 text-[15px] text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Sin cupón bancario</option>
                        {BANK_COUPON_OPTIONS.map((b) => (
                          <option key={b.value} value={b.value}>{b.label}</option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <div className="hidden md:block">
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      Añadir más fotos
                    </label>
                    <label className="block w-full cursor-pointer rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/40 px-4 py-6 text-center dark:border-violet-800 dark:bg-violet-950/20">
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        multiple
                        onChange={handleImageSelect}
                        disabled={imageUploading}
                        className="hidden"
                      />
                      <ImageIcon className="mx-auto mb-2 h-7 w-7 text-gray-400 dark:text-gray-500" />
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {imageUploading
                          ? 'Subiendo...'
                          : `jpg, png o webp · máx. 2MB · ${(imageUrl ? 1 : 0) + imageUrls.length}/${OFFER_MAX_IMAGES}`}
                      </p>
                    </label>
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
                            className="rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
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

                <div className="border-t border-gray-200/80 dark:border-gray-700/80 pt-5 mt-2">
                  <button
                    onClick={() => setShowOptionalSection(!showOptionalSection)}
                    className="flex w-full items-center justify-between rounded-xl bg-gray-50/80 dark:bg-[#1a1a1a]/50 px-4 py-3.5 transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-gray-700/50"
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
                                  className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1a1a1a]/50 px-3 py-2.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
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
                            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1a1a1a]/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none transition-colors duration-200"
                          />
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
                            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1a1a1a]/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/20 transition-colors duration-200"
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
                            className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-[#1a1a1a]/50 px-4 py-3.5 text-[15px] text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-violet-500 focus:bg-white dark:focus:bg-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none transition-colors duration-200"
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
                  </section>

                <div className="flex items-start gap-3 rounded-xl bg-violet-50/80 dark:bg-violet-900/20 border border-violet-100/80 dark:border-violet-800/30 p-4">
                  <Info className="h-5 w-5 text-violet-600 dark:text-violet-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-violet-800 dark:text-violet-300">
                    Solo lo esencial es obligatorio. Revisa precios y fotos antes de publicar.
                  </p>
                </div>
                </div>
                </div>

                <div
                  className={`flex-1 md:flex-[0_0_55%] lg:flex-[0_0_58%] flex flex-col min-w-0 overflow-y-auto bg-[#F5F5F7] dark:bg-[#141414] md:border-l border-gray-200/80 dark:border-gray-700/80 ${
                    mobileTab !== 'preview' ? 'hidden md:flex' : 'flex'
                  }`}
                >
                  <div className="p-5 sm:p-6 md:p-8 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                      Así se verá tu oferta
                    </p>
                    <p className="text-xs text-gray-400 mb-5">Vista previa en tiempo real</p>
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
                              className="pointer-events-none select-none"
                            >
                              <OfferCard
                                title={formData.title.trim() || 'Título de la oferta'}
                                brand={formData.store.trim() || 'Tienda'}
                                originalPrice={
                                  parseDecimalPrice(formData.originalPrice) ||
                                  parseDecimalPrice(formData.discountPrice)
                                }
                                discountPrice={
                                  hasDiscount
                                    ? parseDecimalPrice(formData.discountPrice) ||
                                      parseDecimalPrice(formData.originalPrice)
                                    : parseDecimalPrice(formData.originalPrice)
                                }
                                discount={(() => {
                                  const orig = parseDecimalPrice(formData.originalPrice);
                                  const disc = parseDecimalPrice(formData.discountPrice);
                                  return orig > 0 && disc > 0 ? Math.round((1 - disc / orig) * 100) : 0;
                                })()}
                                description={formData.description.trim() || undefined}
                                image={imageUrl ?? undefined}
                                upvotes={0}
                                downvotes={0}
                                votes={{ up: 0, down: 0, score: 0 }}
                                author={{
                                  username:
                                    (typeof session?.user?.user_metadata?.display_name === 'string' &&
                                      session.user.user_metadata.display_name.trim()) ||
                                    session?.user?.email?.split('@')[0] ||
                                    'Tú',
                                  avatar_url:
                                    typeof session?.user?.user_metadata?.avatar_url === 'string'
                                      ? session.user.user_metadata.avatar_url
                                      : null,
                                }}
                                createdAt={new Date().toISOString()}
                                coupons={formData.coupons.trim() || undefined}
                                bankCoupon={formData.bank_coupon.trim() || null}
                                msiMonths={msiMonths}
                                offerScope={
                                  offerScope === 'in_store' ? 'in_store' : offerScope ? 'online' : null
                                }
                              />
                            </motion.div>
                          </div>
                          <div>
                            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-3">Vista extendida</p>
                            <motion.div
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.08 }}
                              className="rounded-2xl bg-white dark:bg-[#141414] border border-gray-200/80 dark:border-gray-700/80 overflow-hidden shadow-sm"
                            >
                              <div className="h-32 md:h-40 bg-gray-100 dark:bg-[#1a1a1a] flex items-center justify-center">
                                {imageUrl ? (
                                  <img src={imageUrl} alt="" className="max-h-full w-auto object-contain" />
                                ) : (
                                  <Sparkles className="h-12 w-12 text-gray-400" />
                                )}
                              </div>
                              {imageUrls.length > 0 ? (
                                <div className="flex gap-1.5 overflow-x-auto px-3 pt-2">
                                  {imageUrls.slice(0, 6).map((u) => (
                                    <img key={u} src={u} alt="" className="h-12 w-12 rounded-md object-cover shrink-0" />
                                  ))}
                                </div>
                              ) : null}
                              <div className="p-4 md:p-5 space-y-3">
                                <StoreBrandMark store={formData.store.trim() || 'Tienda'} className="text-xs" />
                                <h3 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                                  {formData.title.trim() || 'Título de la oferta'}
                                </h3>
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <span className="text-2xl md:text-3xl font-bold text-violet-600 dark:text-violet-400 tracking-tight">
                                    {formatPreviewPrice(formData.discountPrice || formData.originalPrice || '0')}
                                  </span>
                                  {hasDiscount && formData.originalPrice && (
                                    <span className="text-base text-gray-500 dark:text-gray-400 line-through">
                                      {formatPreviewPrice(formData.originalPrice)}
                                    </span>
                                  )}
                                </div>
                                {hasDiscount &&
                                parseDecimalPrice(formData.originalPrice) > parseDecimalPrice(formData.discountPrice) &&
                                parseDecimalPrice(formData.discountPrice) > 0 ? (
                                  <p className="text-sm text-gray-400">
                                    Ahorras {formatPreviewPrice(String(parseDecimalPrice(formData.originalPrice) - parseDecimalPrice(formData.discountPrice)))}
                                  </p>
                                ) : null}
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
                          className="flex flex-col items-center justify-center min-h-[280px] rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white/40 dark:bg-[#1a1a1a]/30"
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
                    <div className="mt-6 rounded-2xl border border-violet-100 dark:border-violet-900 bg-violet-50/70 dark:bg-violet-950/30 p-4">
                      <p className="text-sm font-semibold text-violet-900 dark:text-violet-200 mb-2">
                        Consejos para una gran oferta
                      </p>
                      <ul className="text-xs text-violet-800/90 dark:text-violet-300 space-y-1.5 list-disc pl-4">
                        <li>Un título claro vende más que uno largo.</li>
                        <li>Revisa que el precio coincida con la tienda.</li>
                        <li>Varias fotos ayudan en la vista extendida; la primera es la portada.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
                </>
              )}

              <div className="flex-shrink-0 border-t border-gray-200/80 dark:border-gray-700/80 bg-white dark:bg-[#141414] px-5 sm:px-6 md:px-8 py-4 sm:py-5">
                <div className="flex gap-3 sm:gap-4">
                  <button
                    onClick={handleCancel}
                    className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#1a1a1a] px-5 py-3.5 text-[15px] font-semibold text-gray-700 dark:text-gray-300 transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 active:scale-[0.99]"
                  >
                    Cancelar
                  </button>
                  {uploadLinkGatePassed ? (
                    uploadStep === 1 ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setUploadStep(2)}
                          className="md:hidden flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg"
                        >
                          Continuar
                        </button>
                        <button
                          type="button"
                          onClick={handleSubmit}
                          disabled={!isFormValid() || isSubmitting || imageUploading}
                          className="hidden md:block flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {imageUploading ? 'Subiendo foto…' : isSubmitting ? 'Publicando…' : 'Publicar oferta'}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!isFormValid() || isSubmitting || imageUploading}
                        className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:opacity-50 disabled:hover:shadow-lg"
                      >
                        {imageUploading ? 'Subiendo foto…' : isSubmitting ? 'Publicando…' : 'Publicar oferta'}
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => setUploadLinkGatePassed(true)}
                      disabled={urlParseLoading}
                      className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 px-5 py-3.5 text-[15px] font-semibold text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {urlParseLoading ? 'Obteniendo datos…' : 'Continuar al formulario'}
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
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#141414] border border-gray-200 dark:border-gray-700 shadow-2xl p-6 md:p-8 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40">
                <Sparkles className="h-7 w-7 text-violet-600 dark:text-violet-400" aria-hidden />
              </div>
              <h2
                id="submit-thanks-title"
                className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-gray-100 tracking-tight"
              >
                Recibida
              </h2>
              <p className="mt-3 text-sm md:text-[15px] text-gray-600 dark:text-gray-400 leading-relaxed">
                {submitThanksApproved
                  ? '¡Gracias por cazar una oferta para la comunidad! Ya está publicada: la verás en Recientes en unos segundos.'
                  : '¡Gracias por cazar una oferta para la comunidad! Pasará por moderación y, si todo está en orden, se publicará enseguida.'}
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
