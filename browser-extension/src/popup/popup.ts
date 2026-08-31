import type { ExtractedProduct } from '../types/product';
import type { ContentExtractResponse } from '../types/messages';
import { DEFAULT_AVENTA_BASE } from '../config';
import {
  buildAuthUrl,
  clearAuth,
  getExtensionConfig,
  getStoredSession,
  setStoredSession,
} from '../auth/session';
import { getValidAccessToken } from '../auth/refresh';
import {
  buildOfferPublicUrl,
  createOffer,
  fetchCooldownStatus,
  parseOfferUrl,
} from '../api/aventa';
import {
  computePreviewDiscountPercent,
  formatMxPrice,
  sanitizePreviewText,
} from '../lib/normalize';

type UiState =
  | 'DETECTING'
  | 'AUTH_REQUIRED'
  | 'INCOMPATIBLE'
  | 'COOLDOWN'
  | 'PREVIEW'
  | 'PUBLISHING'
  | 'SUCCESS'
  | 'ERROR';

const $ = (id: string) => document.getElementById(id)!;

const panels: Record<UiState, string> = {
  DETECTING: 'state-detecting',
  AUTH_REQUIRED: 'state-auth',
  INCOMPATIBLE: 'state-incompatible',
  COOLDOWN: 'state-cooldown',
  PREVIEW: 'state-preview',
  PUBLISHING: 'state-publishing',
  SUCCESS: 'state-success',
  ERROR: 'state-error',
};

let currentProduct: ExtractedProduct | null = null;
let lastOfferUrl: string | null = null;

function showState(state: UiState) {
  Object.values(panels).forEach((id) => $(id).classList.add('hidden'));
  $(panels[state]).classList.remove('hidden');
}

function showError(message: string) {
  $('error-message').textContent = message;
  showState('ERROR');
}

function setTextContent(el: HTMLElement, text: string) {
  el.textContent = text;
}

function renderPreview(product: ExtractedProduct) {
  const titleEl = $('preview-title');
  setTextContent(titleEl, sanitizePreviewText(product.title) || 'Producto sin título');

  const priceEl = $('preview-price');
  const originalEl = $('preview-original');
  const discountEl = $('preview-discount');
  const formattedPrice = formatMxPrice(product.price);
  if (formattedPrice) {
    setTextContent(priceEl, formattedPrice);
    priceEl.classList.remove('hidden');
  } else {
    setTextContent(priceEl, 'Precio no detectado');
  }

  const formattedOriginal = formatMxPrice(product.originalPrice);
  const discount = computePreviewDiscountPercent(product.price, product.originalPrice);
  if (formattedOriginal && product.originalPrice != null && product.price != null) {
    setTextContent(originalEl, `Antes: ${formattedOriginal}`);
    originalEl.classList.remove('hidden');
  } else {
    originalEl.classList.add('hidden');
  }

  if (discount != null) {
    setTextContent(discountEl, `Descuento: ${discount}%`);
    discountEl.classList.remove('hidden');
  } else {
    discountEl.classList.add('hidden');
  }

  setTextContent($('preview-store'), `Tienda: ${product.store}`);

  const img = $('preview-image') as HTMLImageElement;
  const noImg = $('preview-no-image');
  if (product.imageUrl) {
    img.src = product.imageUrl;
    img.alt = sanitizePreviewText(product.title) || 'Producto';
    img.classList.remove('hidden');
    noImg.classList.add('hidden');
  } else {
    img.classList.add('hidden');
    noImg.classList.remove('hidden');
  }

  if (product.partial) {
    $('preview-partial').classList.remove('hidden');
  } else {
    $('preview-partial').classList.add('hidden');
  }
}

async function extractFromActiveTab(): Promise<ExtractedProduct | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) return null;

  try {
    const res = (await chrome.tabs.sendMessage(tab.id, {
      action: 'extractProduct',
    })) as ContentExtractResponse;
    if (res?.ok && res.data) return res.data;
    return null;
  } catch {
    return null;
  }
}

async function enrichWithServer(
  product: ExtractedProduct,
  accessToken: string,
  config: NonNullable<Awaited<ReturnType<typeof getExtensionConfig>>>,
): Promise<ExtractedProduct> {
  try {
    const parsed = await parseOfferUrl(accessToken, config, product.offerUrl);
    return {
      ...product,
      title: parsed.title ?? product.title,
      imageUrl: parsed.image ?? product.imageUrl,
      price: parsed.suggested_discount_price ?? product.price,
      originalPrice: parsed.suggested_original_price ?? product.originalPrice,
      store: parsed.store ?? product.store,
      partial:
        !(parsed.title ?? product.title) ||
        (parsed.suggested_discount_price ?? product.price) == null,
    };
  } catch {
    return product;
  }
}

async function bootstrap() {
  showState('DETECTING');

  const session = await getStoredSession();
  let config = await getExtensionConfig();
  if (!config) {
    config = { aventaBase: DEFAULT_AVENTA_BASE, supabaseUrl: '', supabaseAnonKey: '' };
  }

  if (!session) {
    currentProduct = await extractFromActiveTab();
    showState('AUTH_REQUIRED');
    return;
  }

  const tokenPair = await getValidAccessToken(session, config);
  if (!tokenPair) {
    await clearAuth();
    showState('AUTH_REQUIRED');
    return;
  }
  if (tokenPair.session !== session) {
    await setStoredSession(tokenPair.session);
  }

  try {
    const cooldown = await fetchCooldownStatus(tokenPair.accessToken, config);
    if (!cooldown.canUpload && cooldown.remainingSeconds > 0) {
      setTextContent(
        $('cooldown-timer'),
        `Espera ${cooldown.remainingSeconds}s para publicar otra oferta.`,
      );
      showState('COOLDOWN');
      return;
    }
  } catch {
    // Si falla cooldown, continuar — el servidor validará al publicar
  }

  const domProduct = await extractFromActiveTab();
  if (!domProduct) {
    showState('INCOMPATIBLE');
    return;
  }

  const enriched = await enrichWithServer(domProduct, tokenPair.accessToken, config);
  currentProduct = enriched;
  renderPreview(enriched);
  showState('PREVIEW');
}

async function handlePublish() {
  if (!currentProduct?.offerUrl || !currentProduct.title) {
    showError('Faltan datos para publicar. Abre una página de producto válida.');
    return;
  }

  const session = await getStoredSession();
  const config = (await getExtensionConfig()) ?? {
    aventaBase: DEFAULT_AVENTA_BASE,
    supabaseUrl: '',
    supabaseAnonKey: '',
  };
  if (!session) {
    showState('AUTH_REQUIRED');
    return;
  }

  const tokenPair = await getValidAccessToken(session, config);
  if (!tokenPair) {
    await clearAuth();
    showState('AUTH_REQUIRED');
    return;
  }
  if (tokenPair.session !== session) {
    await setStoredSession(tokenPair.session);
  }

  showState('PUBLISHING');

  try {
    const cooldown = await fetchCooldownStatus(tokenPair.accessToken, config);
    if (!cooldown.canUpload && cooldown.remainingSeconds > 0) {
      setTextContent(
        $('cooldown-timer'),
        `Espera ${cooldown.remainingSeconds}s para publicar otra oferta.`,
      );
      showState('COOLDOWN');
      return;
    }

    const hasDiscount =
      currentProduct.originalPrice != null &&
      currentProduct.price != null &&
      currentProduct.originalPrice > currentProduct.price;

    const payload = {
      title: sanitizePreviewText(currentProduct.title, 500),
      store: currentProduct.store,
      offer_url: currentProduct.offerUrl,
      ...(currentProduct.price != null ? { price: currentProduct.price } : {}),
      ...(hasDiscount && currentProduct.originalPrice != null
        ? { original_price: currentProduct.originalPrice, hasDiscount: true }
        : { hasDiscount: false }),
      ...(currentProduct.imageUrl ? { image_url: currentProduct.imageUrl } : {}),
    };

    const result = await createOffer(tokenPair.accessToken, config, payload);

    if (result.duplicate_offer_id) {
      const link = buildOfferPublicUrl(config, result.duplicate_offer_id);
      setTextContent($('success-detail'), 'Esta oferta ya existe en Aventa.');
      ($('success-link') as HTMLAnchorElement).href = link;
      showState('SUCCESS');
      return;
    }

    if (!result.id) {
      showError('No pudimos publicar la oferta. Inténtalo nuevamente.');
      return;
    }

    const detail =
      result.status === 'approved'
        ? 'Tu oferta fue publicada en Aventa.'
        : 'Oferta enviada a moderación.';
    setTextContent($('success-detail'), detail);
    ($('success-link') as HTMLAnchorElement).href = buildOfferPublicUrl(config, result.id);
    lastOfferUrl = buildOfferPublicUrl(config, result.id);
    showState('SUCCESS');
  } catch {
    showError('No pudimos publicar la oferta. Inténtalo nuevamente.');
  }
}

async function handleLogin() {
  const config = (await getExtensionConfig()) ?? {
    aventaBase: DEFAULT_AVENTA_BASE,
    supabaseUrl: '',
    supabaseAnonKey: '',
  };
  const url = buildAuthUrl(config.aventaBase, chrome.runtime.id);
  await chrome.tabs.create({ url });
}

$('btn-login').addEventListener('click', () => {
  void handleLogin();
});

$('btn-publish').addEventListener('click', () => {
  void handlePublish();
});

$('btn-logout').addEventListener('click', () => {
  void (async () => {
    await clearAuth();
    showState('AUTH_REQUIRED');
  })();
});

$('btn-retry').addEventListener('click', () => {
  void bootstrap();
});

$('btn-close-success').addEventListener('click', () => {
  window.close();
});

void bootstrap();
