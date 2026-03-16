/**
 * AVENTA browser extension — content script
 * Runs on Amazon and MercadoLibre. Extracts product data on message from popup.
 */

function getMetaContent(property) {
  const el = document.querySelector('meta[property="' + property + '"]');
  return el ? (el.getAttribute('content') || '').trim() || null : null;
}

function getAmazonData() {
  const titleEl = document.getElementById('productTitle');
  const title = titleEl ? titleEl.textContent.trim() : null;
  const imgEl = document.getElementById('landingImage');
  const image = imgEl && imgEl.getAttribute('src') ? imgEl.getAttribute('src') : null;
  const store = 'Amazon';
  const url = window.location.href;
  return {
    title: title || getMetaContent('og:title'),
    image: image || getMetaContent('og:image'),
    url,
    store,
  };
}

function getMercadoLibreData() {
  const title = getMetaContent('og:title');
  const image = getMetaContent('og:image');
  const store = 'Mercado Libre';
  const url = window.location.href;
  return { title, image, url, store };
}

function getDomain(hostname) {
  return hostname.replace(/^www\./, '').toLowerCase();
}

function extractProductData() {
  const domain = getDomain(window.location.hostname);
  const isAmazon =
    domain === 'amazon.com' ||
    domain === 'amazon.com.mx' ||
    domain.endsWith('.amazon.com') ||
    domain.endsWith('.amazon.com.mx');
  const isML =
    domain === 'mercadolibre.com' ||
    domain === 'mercadolibre.com.mx' ||
    domain.endsWith('.mercadolibre.com') ||
    domain.endsWith('.mercadolibre.com.mx');

  if (isAmazon) return getAmazonData();
  if (isML) return getMercadoLibreData();
  return { title: null, image: null, url: window.location.href, store: null };
}

chrome.runtime.onMessage.addListener(function (request, _sender, sendResponse) {
  if (request.action === 'getProductData') {
    try {
      const data = extractProductData();
      sendResponse({ ok: true, data: data });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  }
  return true;
});
