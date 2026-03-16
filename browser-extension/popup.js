/**
 * AVENTA browser extension — popup
 * On "Cazar oferta en Aventa": get current tab, ask content script for data, open AVENTA /subir with params.
 */

const AVENTA_BASE = 'https://aventaofertas.com';

document.getElementById('cazar').addEventListener('click', async () => {
  const btn = document.getElementById('cazar');
  const errEl = document.getElementById('error');
  errEl.style.display = 'none';
  errEl.textContent = '';
  btn.disabled = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      errEl.textContent = 'No se pudo obtener la pestaña.';
      errEl.style.display = 'block';
      btn.disabled = false;
      return;
    }

    let data = { title: null, image: null, url: tab.url || '', store: null };
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { action: 'getProductData' });
      if (res?.ok && res.data) {
        data = res.data;
      }
    } catch (e) {
      errEl.textContent = 'Abre una página de producto en Amazon o Mercado Libre.';
      errEl.style.display = 'block';
      btn.disabled = false;
      return;
    }

    const params = new URLSearchParams();
    params.set('upload', '1');
    if (data.title) params.set('title', data.title);
    if (data.image) params.set('image', data.image);
    if (data.url) params.set('offer_url', data.url);
    if (data.store) params.set('store', data.store);

    const url = `${AVENTA_BASE}/subir?${params.toString()}`;
    chrome.tabs.create({ url });
    window.close();
  } catch (e) {
    errEl.textContent = 'Error. Intenta de nuevo.';
    errEl.style.display = 'block';
  }
  btn.disabled = false;
});
