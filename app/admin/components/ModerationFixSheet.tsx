'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, Images, Scissors, Wand2, X } from 'lucide-react';
import { useAuth } from '@/app/providers/AuthProvider';
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock';
import { ALL_CATEGORIES, normalizeCategoryForStorage } from '@/lib/categories';
import { normalizeOfferImageUrl } from '@/lib/offerPath';
import { shortModerationQueueTitle } from '@/lib/moderation/queueTitle';
import { MODERATION_TITLE_MAX } from '@/lib/moderation/botFacts';
import type { ModerationHubMode } from '@/lib/moderation/hubConfig';
import { MSI_MONTHS_MAX, MSI_MONTHS_MIN, isValidMsiMonths } from '@/lib/offers/msiDisplay';
import { BANK_COUPON_OPTIONS, normalizeBankCoupon } from '@/lib/bankCoupons';
import { deriveOfferEditDiscountPercent } from '@/lib/moderation/offerEditContract';
import { formatOfferMoneyInput, sanitizeOfferMoneyTyping } from '@/lib/formatPrice';
import { moderationUi } from '../moderation/moderationUi';

export type FixField = 'photo' | 'link' | 'category' | 'title' | 'price' | 'description' | 'hunter_comment' | 'msi' | 'bank';

function initialCategoryValue(raw: string | null | undefined): string {
  return normalizeCategoryForStorage(raw) ?? '';
}

function initialMoneyDisplay(value: number | null | undefined): string {
  return value != null && Number.isFinite(value) ? formatOfferMoneyInput(value) : '';
}

export type FixableOffer = {
  id: string;
  title: string;
  price?: number | null;
  original_price?: number | null;
  description?: string | null;
  hunter_comment?: string | null;
  coupons?: string | null;
  bank_coupon?: string | null;
  msi_months?: number | null;
  image_url: string | null;
  image_urls?: string[] | null;
  offer_url: string | null;
  category?: string | null;
};

type Props = {
  mode?: ModerationHubMode;
  offer: FixableOffer;
  focusField?: FixField | null;
  onClose: () => void;
  onSaved: (result?: Record<string, unknown>) => void;
};

function msiToInput(raw: number | null | undefined): string {
  return isValidMsiMonths(raw) ? String(raw) : '';
}

/**
 * Hoja «Arreglar»: mobile-first — precio primero, sticky guardar.
 * Misma pieza en teléfono y escritorio. Guardado solo con botón explícito.
 */
export default function ModerationFixSheet({
  mode = 'admin',
  offer,
  focusField = null,
  onClose,
  onSaved,
}: Props) {
  const ui = moderationUi(mode);
  const { session } = useAuth();
  useBodyScrollLock(true);
  const [imageUrl, setImageUrl] = useState(offer.image_url ?? '');
  const [imageUrls, setImageUrls] = useState<string[]>(offer.image_urls ?? []);
  const [offerUrl, setOfferUrl] = useState(offer.offer_url ?? '');
  const [category, setCategory] = useState(() => initialCategoryValue(offer.category));
  const [title, setTitle] = useState(offer.title ?? '');
  const [price, setPrice] = useState(() => initialMoneyDisplay(offer.price));
  const [originalPrice, setOriginalPrice] = useState(() => initialMoneyDisplay(offer.original_price));
  const [msiMonths, setMsiMonths] = useState(msiToInput(offer.msi_months));
  const [bankCoupon, setBankCoupon] = useState(
    normalizeBankCoupon(offer.bank_coupon) ?? ''
  );
  const [description, setDescription] = useState(offer.description ?? '');
  const [hunterComment, setHunterComment] = useState(offer.hunter_comment ?? '');
  const [coupons, setCoupons] = useState(offer.coupons ?? '');
  const [saving, setSaving] = useState(false);
  const [fetchingPhotos, setFetchingPhotos] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);
  const saveLockRef = useRef(false);

  const categoryOrphan =
    Boolean(offer.category?.trim()) && !normalizeCategoryForStorage(offer.category);

  const photoRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const msiRef = useRef<HTMLSelectElement>(null);
  const bankRef = useRef<HTMLSelectElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const target =
      focusField === 'photo'
        ? photoRef.current
        : focusField === 'link'
          ? linkRef.current
          : focusField === 'category'
            ? categoryRef.current
            : focusField === 'title'
              ? titleRef.current
              : focusField === 'price'
                ? priceRef.current
                : focusField === 'msi'
                  ? msiRef.current
                  : focusField === 'bank'
                    ? bankRef.current
                  : focusField === 'description'
                    ? descriptionRef.current
                    : priceRef.current;
    target?.focus();
  }, [focusField]);

  const dirty = useMemo(() => {
    const prevPrice = initialMoneyDisplay(offer.price);
    const prevOriginal = initialMoneyDisplay(offer.original_price);
    const prevMsi = msiToInput(offer.msi_months);
    const prevBank = normalizeBankCoupon(offer.bank_coupon) ?? '';
    const prevExtras = offer.image_urls ?? [];
    const extrasChanged =
      imageUrls.length !== prevExtras.length ||
      imageUrls.some((u, i) => u !== prevExtras[i]);
    return (
      imageUrl.trim() !== (offer.image_url ?? '') ||
      extrasChanged ||
      offerUrl.trim() !== (offer.offer_url ?? '') ||
      (title.trim() !== '' && title.trim() !== offer.title) ||
      normalizeCategoryForStorage(category) !==
        normalizeCategoryForStorage(offer.category ?? null) ||
      price.trim() !== prevPrice ||
      originalPrice.trim() !== prevOriginal ||
      msiMonths.trim() !== prevMsi ||
      bankCoupon !== prevBank ||
      description.trim() !== (offer.description ?? '').trim() ||
      hunterComment.trim() !== (offer.hunter_comment ?? '').trim() ||
      coupons.trim() !== (offer.coupons ?? '').trim()
    );
  }, [
    offer,
    imageUrl,
    imageUrls,
    offerUrl,
    title,
    category,
    price,
    originalPrice,
    msiMonths,
    bankCoupon,
    description,
    hunterComment,
    coupons,
  ]);

  const pasteInto = async (setter: (value: string) => void) => {
    try {
      const text = await navigator.clipboard.readText();
      const clean = text.trim();
      if (!clean) {
        setMessage('El portapapeles está vacío');
        return;
      }
      setter(clean.slice(0, 2048));
      setMessage(null);
      setPreviewBroken(false);
    } catch {
      setMessage('No pude leer el portapapeles; pega con el teclado');
    }
  };

  const fetchPhotosFromLink = async () => {
    const url = offerUrl.trim();
    if (!url.startsWith('http')) {
      setMessage('Pega primero un enlace de producto válido');
      return;
    }
    if (!session?.access_token) {
      setMessage('Inicia sesión para traer fotos del enlace');
      return;
    }
    setFetchingPhotos(true);
    setMessage(null);
    try {
      const res = await fetch('/api/parse-offer-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(typeof data?.error === 'string' ? data.error : 'No pudimos leer fotos de ese enlace');
        return;
      }
      const parsedImages = Array.isArray(data.images)
        ? (data.images as unknown[]).filter((u): u is string => typeof u === 'string' && u.startsWith('http'))
        : [];
      if (data.image && typeof data.image === 'string' && !parsedImages.includes(data.image)) {
        parsedImages.unshift(data.image);
      }
      if (parsedImages.length === 0) {
        setMessage('No encontramos fotos en ese enlace. Pega una URL de imagen a mano.');
        return;
      }
      setImageUrl(parsedImages[0]);
      setImageUrls(parsedImages.slice(1, 8));
      setPreviewBroken(false);
      setMessage(
        `${parsedImages.length} foto${parsedImages.length > 1 ? 's' : ''} lista${parsedImages.length > 1 ? 's' : ''} — guarda para aplicar`,
      );
    } catch {
      setMessage('Error al traer fotos. Intenta de nuevo.');
    } finally {
      setFetchingPhotos(false);
    }
  };

  const save = async () => {
    if (saveLockRef.current || saving) return;
    saveLockRef.current = true;
    setSaving(true);
    setMessage(null);
    setSuccessFlash(false);

    try {
      const body: Record<string, unknown> = { id: offer.id };
      if (imageUrl.trim() !== (offer.image_url ?? '')) body.image_url = imageUrl.trim();
      const prevExtras = offer.image_urls ?? [];
      const extrasChanged =
        imageUrls.length !== prevExtras.length ||
        imageUrls.some((u, i) => u !== prevExtras[i]);
      if (extrasChanged) body.image_urls = imageUrls;
      if (offerUrl.trim() !== (offer.offer_url ?? '')) body.offer_url = offerUrl.trim();
      if (title.trim() && title.trim() !== offer.title) body.title = title.trim();

      const nextCategory = normalizeCategoryForStorage(category);
      const prevCategory = normalizeCategoryForStorage(offer.category ?? null);
      if (nextCategory !== prevCategory) body.category = nextCategory ?? '';

      const prevPrice = initialMoneyDisplay(offer.price);
      if (price.trim() !== prevPrice) {
        if (!price.trim()) {
          setMessage('El precio actual es obligatorio');
          return;
        }
        // Enviar número canónico (sin comas); el API parsea con parseOfferEditMoney.
        body.price = price.trim().replace(/,/g, '');
      }
      const prevOriginal = initialMoneyDisplay(offer.original_price);
      if (originalPrice.trim() !== prevOriginal) {
        body.original_price =
          originalPrice.trim() === '' ? null : originalPrice.trim().replace(/,/g, '');
      }
      const prevMsi = msiToInput(offer.msi_months);
      if (msiMonths.trim() !== prevMsi) {
        body.msi_months = msiMonths.trim() === '' ? null : msiMonths.trim();
      }
      const prevBank = normalizeBankCoupon(offer.bank_coupon) ?? '';
      if (bankCoupon !== prevBank) {
        body.bank_coupon = bankCoupon === '' ? null : bankCoupon;
      }
      const prevDesc = (offer.description ?? '').trim();
      if (description.trim() !== prevDesc) body.description = description.trim();
      const prevHunter = (offer.hunter_comment ?? '').trim();
      if (hunterComment.trim() !== prevHunter) body.hunter_comment = hunterComment.trim();
      const prevCoupons = (offer.coupons ?? '').trim();
      if (coupons.trim() !== prevCoupons) body.coupons = coupons.trim();

      if (Object.keys(body).length <= 1) {
        setMessage('No cambiaste nada');
        return;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const res = await fetch('/api/admin/update-offer', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage(typeof err?.error === 'string' ? err.error : 'No se pudo guardar');
        return;
      }
      const data = await res.json().catch(() => ({}));
      setSuccessFlash(true);
      setMessage('Guardado');
      onSaved(typeof data === 'object' && data ? (data as Record<string, unknown>) : undefined);
      // Brief success then close — queue keeps claim/lock.
      window.setTimeout(() => onClose(), 280);
    } catch {
      setMessage('Error de red al guardar');
    } finally {
      setSaving(false);
      saveLockRef.current = false;
    }
  };

  const previewSrc = !previewBroken ? normalizeOfferImageUrl(imageUrl) : null;
  const titleTooLong = title.trim().length > MODERATION_TITLE_MAX;
  const msiOptions = Array.from({ length: MSI_MONTHS_MAX / 3 }, (_, i) => (i + 1) * 3).filter(
    (n) => n >= MSI_MONTHS_MIN && n <= MSI_MONTHS_MAX,
  );
  const detectedPriceLabel =
    offer.price != null && Number.isFinite(offer.price)
      ? `$${formatOfferMoneyInput(offer.price)}`
      : null;
  const priceChanged = price.trim() !== initialMoneyDisplay(offer.price);
  const draftPriceNum = Number(String(price).trim().replace(/,/g, ''));
  const draftOriginalNum =
    originalPrice.trim() === ''
      ? null
      : Number(String(originalPrice).trim().replace(/,/g, ''));
  const draftDiscount =
    Number.isFinite(draftPriceNum) &&
    draftOriginalNum != null &&
    Number.isFinite(draftOriginalNum)
      ? deriveOfferEditDiscountPercent(draftPriceNum, draftOriginalNum)
      : deriveOfferEditDiscountPercent(offer.price, offer.original_price);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col justify-end bg-black/55 sm:items-center sm:justify-center sm:p-4"
      onClick={() => {
        if (!saving) onClose();
      }}
      role="presentation"
    >
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl sm:max-w-lg sm:rounded-3xl ${ui.modal}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Editar oferta"
        aria-modal="true"
      >
        <div className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${ui.hairline}`}>
          <div>
            <p className={`text-base font-semibold ${ui.title}`}>Editar oferta</p>
            <p className={`text-xs ${ui.muted}`}>
              {dirty ? 'Hay cambios sin guardar' : 'Corrige y guarda sin salir de la cola'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full disabled:opacity-40"
            aria-label="Cerrar"
          >
            <X className={`h-5 w-5 ${ui.soft}`} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {/* 1–2 Precio primero */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`mb-1.5 block text-sm font-medium ${ui.body}`}>
                {priceChanged ? 'Precio publicado' : 'Precio detectado'}
              </label>
              <input
                ref={priceRef}
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(sanitizeOfferMoneyTyping(e.target.value).slice(0, 24))}
                onBlur={() => {
                  const n = Number(String(price).trim().replace(/,/g, ''));
                  if (Number.isFinite(n) && price.trim()) setPrice(formatOfferMoneyInput(n));
                }}
                placeholder="0"
                className={`w-full min-h-12 px-3 text-base tabular-nums font-semibold ${ui.input}`}
                autoComplete="off"
              />
              {priceChanged && detectedPriceLabel ? (
                <p className={`mt-1 text-[11px] ${ui.muted}`}>
                  Detectado: {detectedPriceLabel} → se publicará el valor de arriba
                </p>
              ) : (
                <p className={`mt-1 text-[11px] ${ui.muted}`}>Valor almacenado en Aventa</p>
              )}
            </div>
            <div>
              <label className={`mb-1.5 block text-sm font-medium ${ui.body}`}>Precio original</label>
              <input
                type="text"
                inputMode="decimal"
                value={originalPrice}
                onChange={(e) => setOriginalPrice(sanitizeOfferMoneyTyping(e.target.value).slice(0, 24))}
                onBlur={() => {
                  if (!originalPrice.trim()) return;
                  const n = Number(String(originalPrice).trim().replace(/,/g, ''));
                  if (Number.isFinite(n)) setOriginalPrice(formatOfferMoneyInput(n));
                }}
                placeholder="Opcional"
                className={`w-full min-h-12 px-3 text-sm tabular-nums ${ui.input}`}
                autoComplete="off"
              />
              {draftDiscount > 0 ? (
                <p className={`mt-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300`}>
                  {draftDiscount}% OFF (derivado)
                </p>
              ) : (
                <p className={`mt-1 text-[11px] ${ui.muted}`}>Sin descuento derivado</p>
              )}
            </div>
          </div>

          {/* 3 Enlace */}
          <div>
            <label className={`mb-1.5 block text-sm font-medium ${ui.body}`}>Enlace de la tienda</label>
            <input
              ref={linkRef}
              type="text"
              inputMode="url"
              autoCapitalize="off"
              spellCheck={false}
              value={offerUrl}
              onChange={(e) => setOfferUrl(e.target.value.slice(0, 2048))}
              placeholder="https://articulo.mercadolibre.com.mx/…"
              className={`w-full min-h-12 px-3 font-mono text-xs ${ui.input}`}
            />
            <button
              type="button"
              onClick={() => void pasteInto(setOfferUrl)}
              className={`mt-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-semibold ${ui.btnGhost}`}
            >
              <ClipboardPaste className="h-4 w-4" aria-hidden />
              Pegar
            </button>
            <p className={`mt-1.5 text-[11px] ${ui.muted}`}>
              Al guardar se aplica el tag de afiliado automáticamente.
            </p>
          </div>

          {/* 4 MSI + 5 Cupón bancario */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`mb-1.5 block text-sm font-medium ${ui.body}`}>MSI</label>
              <select
                ref={msiRef}
                value={msiMonths}
                onChange={(e) => setMsiMonths(e.target.value)}
                className={`w-full min-h-12 px-3 text-sm ${ui.select}`}
              >
                <option value="">Sin MSI</option>
                {msiOptions.map((n) => (
                  <option key={n} value={String(n)}>
                    {n} MSI
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={`mb-1.5 block text-sm font-medium ${ui.body}`}>Cupón bancario</label>
              <select
                ref={bankRef}
                value={bankCoupon}
                onChange={(e) => setBankCoupon(e.target.value)}
                className={`w-full min-h-12 px-3 text-sm ${ui.select}`}
              >
                <option value="">Sin banco</option>
                {BANK_COUPON_OPTIONS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 6 Cupón personal (código) */}
          <div>
            <label className={`mb-1.5 block text-sm font-medium ${ui.body}`}>Cupón / código</label>
            <input
              type="text"
              value={coupons}
              onChange={(e) => setCoupons(e.target.value.slice(0, 200))}
              placeholder="Código de descuento (opcional)"
              className={`w-full min-h-12 px-3 text-sm ${ui.input}`}
            />
            <p className={`mt-1 text-[11px] ${ui.muted}`}>
              Separado del cupón bancario. No se apilan automáticamente.
            </p>
          </div>

          {/* 7 Título */}
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label className={`text-sm font-medium ${ui.body}`}>Título</label>
              <span
                className={`text-[11px] tabular-nums ${
                  titleTooLong ? 'text-amber-700 dark:text-amber-200' : ui.muted
                }`}
              >
                {title.trim().length}
              </span>
            </div>
            <textarea
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 500))}
              rows={2}
              className={`w-full px-3 py-2 text-sm ${ui.input}`}
            />
            {title !== shortModerationQueueTitle(title) ? (
              <button
                type="button"
                onClick={() => setTitle(shortModerationQueueTitle(title))}
                className={`mt-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-semibold ${ui.btnGhost}`}
              >
                <Scissors className="h-4 w-4" aria-hidden />
                Quitar el «Ahorra ~%» del bot
              </button>
            ) : null}
          </div>

          {/* Secundarios: foto, categoría, descripción */}
          <div>
            <label className={`mb-1.5 block text-sm font-medium ${ui.body}`}>Foto</label>
            <div className="flex items-start gap-3">
              <div className={`h-16 w-16 shrink-0 overflow-hidden rounded-xl ${ui.thumbBg}`}>
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewSrc}
                    alt=""
                    className="h-full w-full object-contain"
                    referrerPolicy="no-referrer"
                    onError={() => setPreviewBroken(true)}
                  />
                ) : (
                  <span className={`flex h-full items-center justify-center text-[10px] ${ui.faint}`}>
                    Sin foto
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  ref={photoRef}
                  type="url"
                  inputMode="url"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={imageUrl}
                  onChange={(e) => {
                    setImageUrl(e.target.value.slice(0, 2048));
                    setPreviewBroken(false);
                  }}
                  placeholder="https://http2.mlstatic.com/…"
                  className={`w-full min-h-11 px-3 font-mono text-xs ${ui.input}`}
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void pasteInto(setImageUrl)}
                    className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold ${ui.btnGhost}`}
                  >
                    <ClipboardPaste className="h-4 w-4" aria-hidden />
                    Pegar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const n = normalizeOfferImageUrl(imageUrl);
                      if (n) {
                        setImageUrl(n);
                        setPreviewBroken(false);
                      } else {
                        setMessage('Esa dirección no sirve como foto');
                      }
                    }}
                    className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-semibold ${ui.btnGhost}`}
                  >
                    <Wand2 className="h-4 w-4" aria-hidden />
                    Arreglar URL
                  </button>
                  <button
                    type="button"
                    disabled={fetchingPhotos || !offerUrl.trim()}
                    onClick={() => void fetchPhotosFromLink()}
                    className={`inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl text-xs font-semibold disabled:opacity-40 ${ui.btnGhost}`}
                  >
                    <Images className="h-4 w-4" aria-hidden />
                    {fetchingPhotos ? 'Buscando fotos…' : 'Traer fotos del enlace'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className={`mb-1.5 block text-sm font-medium ${ui.body}`}>Categoría</label>
            <select
              ref={categoryRef}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={`w-full min-h-12 px-3 text-sm ${ui.select}`}
            >
              <option value="">Sin categoría</option>
              {ALL_CATEGORIES.filter((c) => c.value !== 'other' || category === 'other').map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                  {c.vital ? ' · Día a día' : ' · Top / Recientes'}
                </option>
              ))}
            </select>
            {categoryOrphan ? (
              <p className={`mt-1 text-[11px] ${ui.muted}`}>
                Categoría anterior no reconocida ({offer.category}). Elige una del catálogo.
              </p>
            ) : null}
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label className={`text-sm font-medium ${ui.body}`}>Descripción</label>
              <span className={`text-[11px] tabular-nums ${ui.muted}`}>
                {description.trim().length}/2000
              </span>
            </div>
            <textarea
              ref={descriptionRef}
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
              rows={3}
              placeholder="Descripción completa (detalle de la oferta)"
              className={`w-full px-3 py-2 text-sm ${ui.input}`}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <label className={`text-sm font-medium ${ui.body}`}>Comentario del cazador</label>
              <span className={`text-[11px] tabular-nums ${ui.muted}`}>
                {hunterComment.trim().length}/160
              </span>
            </div>
            <textarea
              value={hunterComment}
              onChange={(e) => setHunterComment(e.target.value.slice(0, 160))}
              rows={2}
              placeholder="Comentario corto para la tarjeta (opcional)"
              className={`w-full px-3 py-2 text-sm ${ui.input}`}
            />
          </div>
        </div>

        <div
          className={`shrink-0 space-y-2 border-t px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 ${ui.hairline}`}
        >
          {message ? (
            <p
              className={`text-center text-xs ${
                successFlash
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-amber-700 dark:text-amber-200'
              }`}
              role="status"
            >
              {message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className={`inline-flex min-h-[3.25rem] flex-1 items-center justify-center rounded-2xl text-[15px] font-semibold disabled:opacity-40 ${ui.btnGhost}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving || !dirty}
              onClick={() => void save()}
              className="inline-flex min-h-[3.25rem] flex-[1.4] items-center justify-center rounded-2xl bg-emerald-600 text-[15px] font-bold text-white active:bg-emerald-700 disabled:opacity-40"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
