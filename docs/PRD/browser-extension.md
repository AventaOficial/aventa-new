# PRD — Browser extension (Extensión Chrome)

## Feature name

**AVENTA — Cazar oferta** — Extensión de Chrome para enviar ofertas desde Amazon y Mercado Libre a AVENTA.

---

## Goal

Permitir a los cazadores, desde una página de producto en Amazon o Mercado Libre, abrir AVENTA con el modal de subir oferta ya rellenado (título, imagen, URL, tienda) mediante un clic en la extensión.

---

## User flow

1. Usuario instala la extensión (carga descomprimida en chrome://extensions).
2. Navega a una página de producto en **amazon.com**, **amazon.com.mx**, **mercadolibre.com.mx** (o dominios soportados).
3. Clic en el icono de la extensión → se abre el popup con el botón **"Cazar oferta en Aventa"**.
4. Clic en el botón → el content script extrae título, imagen, URL y tienda (Amazon / Mercado Libre).
5. Se abre una nueva pestaña: **https://aventaofertas.com/subir?upload=1&title=...&image=...&offer_url=...&store=...**.
6. La app redirige a `/?upload=1&...`; la página principal abre el modal de subir oferta y ActionBar prellena título, image_url, offer_url y store.
7. Usuario completa precio y categoría y envía (flujo normal de subir oferta).

---

## UI components (extension)

| Archivo | Descripción |
|---------|-------------|
| popup.html / popup.js | Popup con título AVENTA, texto breve y botón "Cazar oferta en Aventa". Al clic: mensaje al content script, construcción de URL /subir, apertura en nueva pestaña. |
| content.js | Inyectado en Amazon/ML. Escucha mensaje `getProductData`; extrae título (#productTitle, og:title), imagen (#landingImage, og:image), URL (location.href), store ("Amazon" o "Mercado Libre"). Responde al popup. |
| manifest.json | Manifest V3; host_permissions y content_scripts para dominios soportados; action.default_popup = popup.html. |

---

## API / app integration

- La extensión **no llama** a la API de la app; solo abre una URL con query params.
- **App:** `app/subir/page.tsx` redirige a `/?upload=1&title=...&image=...&offer_url=...&store=...`.
- **App:** `app/page.tsx` detecta `upload=1` y llama a `openUploadModal()`.
- **App:** `app/components/ActionBar.tsx` al abrir el modal con `upload=1` lee los params y prellena formData (title, offer_url, store) e imageUrl; luego limpia la URL con `router.replace('/')`.

---

## Files involved (extension)

- `browser-extension/manifest.json`
- `browser-extension/content.js`
- `browser-extension/background.js` (mínimo)
- `browser-extension/popup.html`
- `browser-extension/popup.js`
- `browser-extension/README.md`

---

## Files involved (app)

- `app/subir/page.tsx` — Redirección a / con params.
- `app/page.tsx` — Efecto que abre modal cuando `upload=1`.
- `app/components/ActionBar.tsx` — Prefill desde searchParams y limpieza de URL.
