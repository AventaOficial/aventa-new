# AVENTA — Extensión de Chrome

Extensión mínima para enviar ofertas desde Amazon y Mercado Libre a AVENTA.

## Estructura

```
browser-extension/
├── manifest.json   # Manifest V3, permisos y content scripts
├── content.js      # Script en Amazon/ML: extrae título, imagen, URL, tienda
├── background.js   # Service worker (opcional)
├── popup.html      # Popup con botón "Cazar oferta en Aventa"
├── popup.js        # Lógica: pide datos al content, abre AVENTA /subir con params
└── README.md       # Este archivo
```

## Sitios soportados

- amazon.com, amazon.com.mx
- mercadolibre.com, mercadolibre.com.mx, articulo.mercadolibre.com.mx

## Cómo instalar (desarrollo)

1. Abre Chrome y ve a `chrome://extensions/`.
2. Activa "Modo desarrollador".
3. Pulsa "Cargar descomprimida" y elige la carpeta `browser-extension`.
4. La extensión aparecerá en la barra; haz clic en el icono para abrir el popup.

## Uso

1. Entra en una página de producto en Amazon o Mercado Libre.
2. Haz clic en el icono de la extensión.
3. Pulsa "Cazar oferta en Aventa".
4. Se abrirá una pestaña en **https://aventaofertas.com/subir** con los datos en la URL; la app redirige a `/` y abre el modal de subir oferta con título, imagen, enlace y tienda rellenados.

## Integración con la app AVENTA

- La app expone la ruta **/subir**, que redirige a `/?upload=1&title=...&image=...&offer_url=...&store=...`.
- La página principal (/) detecta `upload=1` y abre el modal de subir oferta.
- El componente `ActionBar` lee los query params y rellena el formulario (título, imagen de vista previa, enlace, tienda) y luego limpia la URL.

No se modifica la arquitectura ni el POST /api/offers; el usuario solo completa precio y categoría y envía.
