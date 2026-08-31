# AVENTA Browser Extension V1

Extensión Manifest V3 para publicar ofertas de **Amazon** y **Mercado Libre** en Aventa con un clic.

## Instalación en desarrollo

1. Compilar la extensión:

```bash
npm run build:extension
```

2. Abrir Chrome o Edge → `chrome://extensions` / `edge://extensions`
3. Activar **Modo de desarrollador**
4. **Cargar descomprimida** → seleccionar la carpeta `browser-extension/`
5. Para desarrollo local con `localhost:3000`, la auth bridge ya permite ese origen en `externally_connectable`

## Arquitectura

```
browser-extension/
  manifest.json          # MV3, permisos mínimos
  popup/                 # HTML + CSS del popup
  src/
    adapters/            # amazon.ts, mercadoLibre.ts (extensible)
    api/                 # Cliente HTTP hacia Aventa
    auth/                # Sesión + refresh Supabase
    background/          # Service worker (auth externa)
    content/             # Extracción DOM en página de producto
    popup/               # Lógica UI del popup
    lib/                 # Normalización, precios preview
    types/
  dist/                  # Salida compilada (tsc)
```

### Principio: cliente delgado

La extensión **no** implementa:

- tags de afiliados
- moderación / status
- reputación
- Rewards / pagos
- deduplicación final

Todo eso vive en el backend de Aventa.

## APIs utilizadas

| Endpoint | Uso |
|----------|-----|
| `POST /api/parse-offer-url` | Enriquecer datos desde servidor (opcional, post-DOM) |
| `POST /api/offers` | Crear oferta |
| `GET /api/me/upload-cooldown-status` | Cooldown antes de publicar |

La extensión **nunca** envía `created_by`, `status`, campos de moderación ni datos financieros.

## Autenticación

1. Popup → **Iniciar sesión**
2. Se abre `https://aventaofertas.com/extension/auth?ext=<extensionId>`
3. Usuario inicia sesión en Aventa (si hace falta)
4. La página envía la sesión Supabase a la extensión vía `chrome.runtime.sendMessage` (externally_connectable)
5. La extensión guarda tokens en `chrome.storage.local` y refresca con Supabase Auth API

**No** se usan tokens en query strings. **No** se incluyen secretos de servidor.

## Flujo Amazon / Mercado Libre

1. Usuario en página de producto
2. Content script extrae datos DOM (adapters con fallbacks)
3. Popup muestra preview (descuento solo informativo)
4. Opcional: `parse-offer-url` mejora título/precio/imagen
5. `POST /api/offers` con URL original (afiliación en servidor)

## Permisos

- `activeTab` — pestaña actual
- `storage` — sesión local
- `host_permissions` — solo dominios Amazon y Mercado Libre
- `externally_connectable` — solo Aventa (prod + localhost)

## Agregar una nueva tienda

1. Crear `src/adapters/nuevaTienda.ts` implementando `StoreAdapter`
2. Registrar en `src/adapters/index.ts`
3. Añadir `matches` en `manifest.json` (content_scripts + host_permissions)
4. Añadir tests en `tests/extension/`

## Build de producción

```bash
npm run build:extension
```

Empaquetar la carpeta `browser-extension/` (incluye `dist/`, `popup/`, `manifest.json`) como `.zip` para Chrome Web Store / Edge Add-ons cuando corresponda.

## Tests

```bash
npm run test:contracts   # incluye tests/extension
```
