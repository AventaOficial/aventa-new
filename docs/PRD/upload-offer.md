# PRD — Subir oferta (Upload offer)

## Feature name

**Subir oferta** — Flujo para que los cazadores publiquen ofertas en AVENTA.

---

## Goal

Permitir a los usuarios autenticados compartir ofertas con la comunidad: título, precios, categoría, tienda, enlace, descripción, imágenes y datos opcionales. Las ofertas pasan por moderación (o auto-aprobación por reputación) antes de aparecer en el feed.

---

## User flow

1. Usuario hace clic en **Subir** (ActionBar móvil o desktop).
2. Se abre el modal de subir oferta (o redirige a login si no hay sesión).
3. Opcional: pega URL de oferta; se llama a POST /api/parse-offer-url y se rellenan título, imagen y tienda.
4. Usuario rellena obligatorios: título, precio original, precio con descuento (si aplica), categoría, tienda.
5. Opcional: enlace, descripción, fotos (upload a Storage), MSI, pasos, condiciones, cupones, comentario para moderadores.
6. Envía formulario; POST /api/offers.
7. Modal se cierra; mensaje de éxito; cooldown 60 s antes de otra oferta.
8. Oferta queda pending (moderación) o approved (si reputación ≥ 3).

---

## UI components

| Componente | Ubicación | Descripción |
|------------|-----------|-------------|
| ActionBar | app/components/ActionBar.tsx | Botón Subir, modal con formulario, vista previa, validación. |
| Modal subir oferta | Dentro de ActionBar | Campos: título, URL, precios, categoría, tienda, descripción, fotos, MSI, sección opcional. |
| Página /subir | app/subir/page.tsx | Entrada para extensión y deep links; redirige a /?upload=1 y params. |

---

## API endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| POST | /api/offers | Crear oferta. Auth obligatorio; rate limit; bans. |
| POST | /api/upload-offer-image | Subir imagen a bucket offer-images. |
| POST | /api/parse-offer-url | Parsear URL (Amazon, ML, genérico). Devuelve title, image, store. |

---

## Files involved

- app/components/ActionBar.tsx
- app/api/offers/route.ts
- app/api/upload-offer-image/route.ts
- app/api/parse-offer-url/route.ts
- app/subir/page.tsx
- app/page.tsx (abre modal con upload=1)
- lib/categories.ts
- lib/server/reputation.ts
