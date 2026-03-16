# Sistema "Subir oferta" — Estructura y contexto

Documento de referencia: flujo completo, componentes, API, base de datos y consideraciones.

---

## 1. Resumen del flujo

1. Usuario abre el modal "Subir oferta" desde la **ActionBar** (botón "Subir" en móvil o escritorio).
2. Rellena el formulario (obligatorios: título, precios, categoría, tienda; opcionales: URL, descripción, fotos, MSI, pasos, condiciones, cupones, comentario para moderadores).
3. Opcionalmente sube imágenes vía **POST /api/upload-offer-image** (bucket Supabase `offer-images`).
4. Al enviar, el front hace **POST /api/offers** con el payload en JSON.
5. La API valida sesión, rate limit, bans, datos y escribe en la tabla **`offers`**.
6. Si el usuario tiene **reputación nivel ≥ 3**, la oferta se crea con `status: 'approved'` y `expires_at` 7 días; si no, `status: 'pending'` (moderación).
7. Se llama al RPC **`increment_offers_submitted_count`** para el perfil del usuario.
8. El modal se cierra, se muestra mensaje de éxito y un **cooldown de 60 segundos** antes de poder subir otra.

---

## 2. Componentes y archivos

| Elemento | Ubicación | Rol |
|----------|-----------|-----|
| **ActionBar** | `app/components/ActionBar.tsx` | Barra inferior (móvil) y lateral (desktop). Botón "Subir" abre el modal de subir oferta. Contiene todo el formulario, estado, validación, envío y vista previa. |
| **Modal de subir oferta** | Dentro de `ActionBar.tsx` | Modal full-screen (móvil) o centrado (desktop). Pestañas en móvil: "Completar" y "Vista previa". Sección expandible "Información adicional (opcional)". |
| **Apertura desde fuera** | `useUI().uploadModalRequested` / `clearUploadModalRequest` | Cualquier componente puede pedir abrir el modal llamando a la función que setea `uploadModalRequested`; el `useEffect` en ActionBar abre el modal y limpia el flag. |
| **Categorías** | `lib/categories.ts` | `ALL_CATEGORIES` (tecnologia, gaming, hogar, supermercado, moda, belleza, viajes, servicios, other). El `<select>` del formulario usa `c.value` como valor enviado. |

---

## 3. Formulario (campos)

### Obligatorios

- **Título** (`title`) — texto.
- **Precio original** (`originalPrice`) — número; si "no tiene descuento", también se usa como precio final.
- **Precio con descuento** (`discountPrice`) — obligatorio solo si "¿Tiene descuento?" = Sí.
- **Categoría** (`category`) — `<select>` con `ALL_CATEGORIES`; se envía el `value` (ej. `tecnologia`, `moda`, `hogar`).
- **Tienda** (`store`) — texto libre.

### Opcionales

- **Enlace de la oferta** (`offer_url`) — URL.
- **Descripción** (`description`) — texto; en la card del feed se muestran los primeros 80 caracteres (`OFFER_CARD_DESCRIPTION_MAX_LENGTH`).
- **Fotos** — una o varias; se suben a Supabase Storage (`offer-images`) vía **POST /api/upload-offer-image**; el formulario envía `image_url` (primera) e `image_urls` (array de URLs).
- **MSI** — checkbox + select 3, 6, 12, 18, 24 meses; se envía `msi_months`.
- **Pasos** — lista de hasta 20 pasos; el front envía `steps` como **string JSON** (array de strings).
- **Condiciones** (`conditions`) — texto.
- **Cupones** (`coupons`) — texto.
- **Comentario para moderadores** (`moderator_comment`) — texto, máx. 500 caracteres.

### Validación en front

- `isFormValid()`: título no vacío, precio original no vacío, categoría elegida, tienda no vacía y, si tiene descuento, precio con descuento no vacío.

---

## 4. API POST /api/offers

**Archivo:** `app/api/offers/route.ts`

### Seguridad y límites

- **Rate limit** por IP (`enforceRateLimitCustom(ip, 'offers')`): evita abuso de envíos.
- **Auth:** header `Authorization: Bearer <token>`; si no hay token → 401 "Inicia sesión para subir ofertas".
- **Bans:** consulta `user_bans`; si el usuario está baneado → 403 "No puedes publicar ofertas. Tu cuenta está restringida."

### Body esperado (JSON)

| Campo | Tipo | Obligatorio | Notas |
|-------|------|-------------|--------|
| `title` | string | Sí | Trim; no vacío. |
| `store` | string | Sí | Trim; no vacío. |
| `original_price` | number | Condicional | Si hay descuento; se guarda en columna `original_price`. |
| `price` | number | Sí | Precio final (con descuento o único). Debe ser ≥ 0. |
| `hasDiscount` | boolean | No | Solo informativo en el body; la API deriva si guarda `original_price`. |
| `category` | string | No | Se guarda tal cual (ej. `tecnologia`, `moda`). **Importante:** el feed "Día a día" filtra por valores **DB** (`electronics`, `fashion`, `home`, `other`). Si el form envía macro (`tecnologia`), la oferta queda con `category=tecnologia` y no coincidirá con el filtro `.in('category', ['electronics','home','fashion','other'])` a menos que se mapee en backend o en el form. |
| `offer_url` | string | No | Trim. |
| `description` | string | No | Trim. |
| `steps` | string | No | Trim (texto plano o JSON string; la API lo guarda como texto). |
| `conditions` | string | No | Trim. |
| `coupons` | string | No | Trim. |
| `moderator_comment` | string | No | Trim; máx. 500 caracteres. |
| `image_url` | string | No | URL de la primera imagen; por defecto `/placeholder.png` si no hay. |
| `image_urls` | string[] | No | Lista de URLs; la primera puede repetir `image_url`. |
| `msi_months` | number | No | 1–24; se guarda en `msi_months`. |

### Lógica de estado al crear

- Se lee `reputation_level` del perfil del usuario (`profiles.reputation_level`).
- Si **`reputation_level >= REPUTATION_LEVEL_AUTO_APPROVE_OFFERS`** (3):  
  `status = 'approved'`, `expires_at = now + 7 días`.
- Si no:  
  `status = 'pending'` (queda en cola de moderación).

### Inserción y post-inserción

- **Tabla:** `offers`.
- Tras insert correcto se llama **`supabase.rpc('increment_offers_submitted_count', { uuid: createdBy })`** (el RPC incrementa `profiles.offers_submitted_count`; si el RPC o la columna no existen, el error se ignora).
- Respuesta éxito: `{ id: string, ok: true }`.

---

## 5. Subida de imágenes

**Endpoint:** **POST /api/upload-offer-image**

**Archivo:** `app/api/upload-offer-image/route.ts`

- **Auth:** Bearer obligatorio.
- **Body:** `FormData` con campo `file` (imagen).
- **Límites:** 2 MB máx.; tipos permitidos: jpeg, jpg, png, webp.
- **Storage Supabase:** bucket `offer-images`, nombre `{uuid}.{ext}`.
- **Respuesta:** `{ url: string }` (URL pública de la imagen).

El formulario puede subir varias imágenes; la primera se usa como `image_url` y el resto se añaden a `image_urls`.

---

## 6. Base de datos (tabla `offers`)

Columnas usadas por "subir oferta" (según migraciones y vista):

| Columna | Tipo | Origen / Notas |
|---------|------|-----------------|
| `id` | uuid | Generado por Supabase. |
| `title` | text | Obligatorio. |
| `price` | numeric | Precio final (obligatorio). |
| `original_price` | numeric | Nullable; si hay descuento. |
| `store` | text | Tienda (obligatorio). |
| `category` | text | Nullable; valores recomendados en BD: `electronics`, `fashion`, `home`, `sports`, `books`, `other`. El form actual envía valores de UI (tecnologia, moda, hogar…). |
| `offer_url` | text | Nullable. |
| `description` | text | Nullable. |
| `steps` | text | Nullable; en el form se envía como JSON string de array. |
| `conditions` | text | Nullable. |
| `coupons` | text | Nullable. |
| `moderator_comment` | text | Nullable; máx. 500 (app). |
| `image_url` | text | URL principal; por defecto `/placeholder.png` si no hay. |
| `image_urls` | array/text | Según esquema; array de URLs. |
| `msi_months` | int | Nullable; 1–24. |
| `status` | text | `'pending'` o `'approved'` al crear (según reputación). Luego moderación puede poner `'rejected'` o `'published'`. |
| `created_by` | uuid | FK a usuario que crea la oferta. |
| `created_at` | timestamptz | Automático. |
| `expires_at` | timestamptz | Nullable; se setea en aprobación automática (7 días). |
| `upvotes_count`, `downvotes_count`, `reputation_weighted_score`, `ranking_momentum` | etc. | Actualizados por triggers/vistas; no los setea el POST. |

La vista **`ofertas_ranked_general`** expone estas columnas (y otras calculadas) para el feed; debe incluir `category` para que el filtro "Día a día" funcione.

---

## 7. Categorías: UI vs BD vs feed

- **Formulario:** El `<select>` usa `ALL_CATEGORIES` de `lib/categories.ts`; los valores son **macro** (ej. `tecnologia`, `moda`, `hogar`, `other`).
- **API:** Guarda `body.category` tal cual (sin convertir a valor de BD).
- **Feed "Día a día":** Filtra con `.in('category', VITAL_FILTER_VALUES)` donde `VITAL_FILTER_VALUES` son valores **de BD** permitidos: `electronics`, `fashion`, `home`, `sports`, `books`, `other` (véase `DB_CATEGORY_WHITELIST` y `MACRO_TO_DB_CATEGORIES` en `lib/categories.ts`).

**Consecuencia:** Si el usuario elige "Tecnología" (`tecnologia`), se guarda `category=tecnologia`. En el feed, el filtro usa `electronics`, por tanto esa oferta **no** entrará en el filtro por categoría "vitales" a menos que:

- se mapee en el **backend** al guardar (ej. `tecnologia` → `electronics` usando `MACRO_TO_DB_CATEGORIES`), o  
- el **frontend** envíe ya el valor de BD (ej. `electronics` para Tecnología).

Recomendación: mapear en **POST /api/offers** de macro a un valor de BD antes de hacer el `insert`, usando el mismo mapeo que en `lib/categories.ts` (`MACRO_TO_DB_CATEGORIES`), para que las ofertas aparezcan correctamente en "Día a día" y en filtros por categoría.

---

## 8. Cooldown y UX

- **COOLDOWN_SECONDS = 60:** Tras un envío exitoso, el botón "Subir" queda deshabilitado 60 segundos y se muestra "Espera Xs para enviar otra oferta".
- **Mensaje de éxito:** "Gracias por compartir. Revisaremos tu oferta pronto." (se oculta a los 4 segundos).
- **Al cerrar el modal:** Se resetea el formulario (`handleCancel`).

---

## 9. Pasos (campo `steps`)

- En el form son una lista de strings (hasta 20); el front hace `steps: JSON.stringify(stepsList.map(...).filter(Boolean))` y envía ese string.
- La API guarda `body.steps` como string en la columna `steps` (no parsea JSON). En la página de oferta o en el modal se puede mostrar parseando ese string como JSON si se desea listar los pasos.

---

## 10. Resumen de archivos clave

| Archivo | Uso |
|---------|-----|
| `app/components/ActionBar.tsx` | Modal, formulario, validación, payload, POST /api/offers, vista previa, subida de imágenes. |
| `app/api/offers/route.ts` | POST: auth, rate limit, bans, validación, estado (pending/approved), insert en `offers`, RPC `increment_offers_submitted_count`. |
| `app/api/upload-offer-image/route.ts` | POST: auth, validación de tipo/tamaño, upload a bucket `offer-images`, devuelve URL. |
| `lib/categories.ts` | `ALL_CATEGORIES`, `MACRO_TO_DB_CATEGORIES`, `DB_CATEGORY_WHITELIST`, `VITAL_FILTER_VALUES`. |
| `lib/server/reputation.ts` | `REPUTATION_LEVEL_AUTO_APPROVE_OFFERS` (3). |

---

*Documento de referencia del sistema "Subir oferta". Para cambios en esquema de BD o RPCs, revisar también las migraciones en `docs/supabase-migrations/`.*
