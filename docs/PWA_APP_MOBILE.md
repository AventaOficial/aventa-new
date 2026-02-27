# Llevar AVENTA a app móvil

## PWA (implementado)

La app ya tiene configurado:

- **Manifest** en `app/manifest.ts`: nombre, descripción, `display: standalone`, colores e iconos. Next.js lo sirve en `/manifest.webmanifest`.
- **Metadata** en `app/layout.tsx`: `manifest`, `appleWebApp`, `icons`, `themeColor` para instalación y tema.

Los iconos apuntan a `/placeholder.png`. Para mejorar la instalación, genera iconos 192×192 y 512×512 (PNG), súbelos a `public/` como `icon-192.png` e `icon-512.png`, y actualiza las rutas en `app/manifest.ts`.

**Service Worker / offline:** Next.js no genera un SW por defecto. Para caché offline puedes añadir después Serwist u otro plugin. Para solo "instalar en pantalla de inicio" no es obligatorio.

**Ventajas:** Un solo código, sin tiendas, actualizaciones al subir a Vercel.  
**Limitaciones:** No es app nativa en App Store / Play Store.

## TWA / Add to Home Screen

Chrome en Android muestra "Añadir a la pantalla de inicio" cuando hay manifest y HTTPS. Con lo anterior ya aplica.

## App nativa (Store)

Si más adelante quieres app en Google Play o App Store: **Capacitor** empaqueta tu Next.js en proyecto nativo (Android/iOS). React Native implica otro código.
