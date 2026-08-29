# Parse de ofertas Mercado Libre — `meli.la`, galería e imágenes

Documento de referencia: qué fallaba, por qué en PC parecía funcionar y en mobile no, y qué se corrigió.

**Commit principal:** `19c0fb4` — *Fix ML social-page gallery extraction for meli.la links.*

---

## Contexto de negocio

- Los creadores **deben poder pegar `meli.la/...`** en el formulario de subir oferta: ahí está la **afiliación** de Mercado Libre.
- La URL que pega el usuario **se guarda tal cual** en la oferta (`offer_url`). El backend solo resuelve redirecciones para **leer** la página; no sustituye el enlace corto al publicar.
- Los **links largos** (`mercadolibre.com.mx/...`) siguen siendo válidos y útiles cuando alguien comparte desde la app de ML y quiere la mejor experiencia de parseo. **No cambian de comportamiento** con este fix; se benefician del mismo filtro de imágenes CDN.

---

## Síntoma reportado

1. Al pegar `https://meli.la/…` en **mobile** (incluso incógnito), el parse solo devolvía **1 foto** (portada).
2. En **PC**, el mismo flujo parecía funcionar bien (varias fotos, título, precio).
3. En un caso concreto entró una **imagen del logo de Aventa** en la galería (página social de ML con assets mezclados).

---

## Causa raíz (no era “mobile vs PC” en el servidor)

El endpoint `/api/parse-offer-url` es **el mismo** para todos los dispositivos. No hay rama mobile en el parser.

Lo que ocurría:

### 1. `meli.la` redirige a páginas **social**, no a la ficha clásica del producto

Ejemplo: `meli.la/2vWwBNv` → `mercadolibre.com.mx/social/capitanjeshua?…`

Esas páginas **sí incluyen** el `item_id` en el JSON del HTML (p. ej. `MLM57589015`) y **muchas URLs** de fotos en `http2.mlstatic.com` (~24 en pruebas).

### 2. Bug en el filtro de CDN del HTML (`parseOfferPageHtml.ts`)

El extractor solo aceptaba formatos viejos (`D_NQ_NP_2X_`, `-F.`, `-O.`). Mercado Libre usa formatos nuevos como:

- `D_NQ_915700-MLA116764501833_082026-OO.webp`
- `D_NQ_NP_857412-MLA109806180229_032026-G.webp`

**Casi todas las fotos del HTML se descartaban** → solo quedaba `og:image` (1 foto).

### 3. Bug en deduplicación ML (`selectOfferImages.ts`)

`mercadoLibreImageResourceId` buscaba `mlstatic.com` en el **pathname** de la URL, pero el dominio está en el **hostname**. Todas las fotos ML devolvían `null` como id de recurso y la deduplicación no unificaba bien variantes `-O` / `-OO` del mismo producto.

### 4. Resolución de `meli.la` incompleta (`offerUrl.ts`)

Si la redirección terminaba en `/social/…` **sin** `item_id` en la URL, el resolver devolvía otra vez `meli.la` en lugar de la URL social final. El fetch igual seguía funcionando por redirect, pero el flujo era inconsistente.

### 5. Percepción PC vs mobile

| Factor | Efecto |
|--------|--------|
| **API OAuth ML** en producción | A veces devolvía galería completa por `item_id` → en PC “funcionaba” aunque el HTML fallara |
| **UI mobile** | Paso 2 ocultaba “Imágenes encontradas”; vista previa solo mostraba portada |
| **Incógnito** | Descartó caché PWA → confirmó que el problema era **código en servidor**, no caché local |

---

## Solución aplicada

### Parser e imágenes

| Archivo | Cambio |
|---------|--------|
| `lib/offers/parseOfferPageHtml.ts` | Patrón CDN ampliado (`D_[A-Za-z0-9_-]+`); eliminado filtro restrictivo que descartaba formatos nuevos |
| `lib/offers/selectOfferImages.ts` | Fix `mercadoLibreImageResourceId` (hostname); soporte `-OO`, `-G`, `-V`, `-T`; filtro de imágenes propias de Aventa (`aventaofertas.com`, `/logo.*`) |
| `lib/offerUrl.ts` | `meli.la` → aceptar destino ML social aunque no haya `item_id` en la URL |
| `app/components/ActionBar.tsx` | Galería visible en mobile en todos los pasos del formulario |

### Resultado verificado (link de prueba `meli.la/2vWwBNv`)

- ~24 imágenes en HTML crudo  
- **8 fotos** finales (tope `OFFER_MAX_IMAGES`)  
- Mensaje de parse: *“Listo: título, 8 fotos, precio, categoría”*

### Links largos

**No cambia la URL guardada.** Mejoras compartidas:

- Mismo filtro CDN para fotos embebidas en HTML  
- Misma deduplicación ML  
- Links largos con `wid` / `pdp_filters` siguen resolviendo `item_id` directo en URL → API OAuth suele responder aún más rápido  

---

## Moderación (follow-up)

Problemas relacionados en revisión mobile/tablet:

- Solo se veía la **primera foto** en detalle mobile  
- Scroll anidado en panel de detalle (lista + card con scroll interno)  
- Logo de Aventa colado en galería desde HTML social  

**Correcciones:** componente `ModerationImageGallery` (hero + miniaturas + contador), layout mobile sin doble scroll, filtro de assets `aventaofertas.com` en `selectOfferImages`.

---

## Test plan manual

1. **Subir oferta (mobile, incógnito, logueado)**  
   - Pegar `https://meli.la/…`  
   - Verificar paso **“1 · Encontrado”** → grid con varias fotos y texto *“N fotos”*

2. **Subir oferta (PC)**  
   - Mismo link → misma cantidad de fotos en la respuesta del API

3. **Link largo**  
   - Pegar URL completa `mercadolibre.com.mx/…` → parse normal; URL guardada sin cambios

4. **Moderación (mobile/tablet)**  
   - Abrir oferta pendiente → ver contador `1/N`, tira de miniaturas, aprobar/rechazar sin perder fotos bajo scroll

5. **Regresión**  
   - `npx vitest run tests/offers/selectOfferImages.test.ts tests/offers/parseOfferPageHtml.test.ts`

---

## Archivos de debug (local, no commitear)

Scripts útiles durante la investigación:

- `scripts/debug-meli-extract.ts` — extracción HTML vs `selectOfferImages`  
- `scripts/debug-meli-full-parse.ts` — pipeline completo (resolve + HTML + API ML)

---

## Resumen

| Pregunta | Respuesta |
|----------|-----------|
| ¿Hay que dejar de usar `meli.la`? | **No.** Es el enlace correcto para afiliación. |
| ¿Mobile parsea distinto? | **No.** Mismo backend; había bugs de parser + UI. |
| ¿Links largos empeoran? | **No.** Misma lógica; suelen parsear igual o mejor. |
| ¿Qué hacer si falla un `meli.la`? | Probar tras deploy; si persiste, pegar URL larga como respaldo temporal y reportar el enlace concreto. |
