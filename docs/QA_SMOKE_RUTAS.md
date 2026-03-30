# Smoke test — rutas principales (AVENTA)

Checklist manual tras un deploy o antes de un release. Marca cada ítem al probar en **staging** o **local** (`npm run dev`).

## Comandos técnicos en el repo

- **Contratos / lógica en código (no es “simular Gmail”, pero sí verificación automática):**  
  `npm run test:contracts`
- **Tipos TypeScript:**  
  `npx tsc --noEmit`
- **Build de producción:**  
  `npm run build`

Para **flujos completos en el navegador** (clics, login, formularios) lo habitual es añadir **Playwright** o **Cypress**; hoy el proyecto no incluye E2E. Esta lista cubre verificación manual rápida.

## Rutas y qué comprobar

### Inicio `/`

- Carga sin error; Hero con título y buscador.
- Buscar texto: el listado filtra o reacciona según el comportamiento actual.
- Scroll y tarjetas de ofertas visibles (imágenes, precios, enlaces a oferta).

### Descubre `/descubre`

- Página carga; guía o contenido esperado sin errores de consola graves.

### Subir oferta `/subir`

- Con sesión: formulario accesible y envío o validaciones coherentes.
- Sin sesión: redirección o mensaje para iniciar sesión (según diseño actual).

### Favoritos `/me/favorites`

- Con sesión: lista o vacío con mensaje claro.
- Sin sesión: comportamiento definido (login / vacío).

### Configuración `/settings`

- Preferencias de cuenta y correo cargan; guardar un cambio y recargar confirma persistencia.

### Perfil `/me`

- Datos del usuario; enlaces a favoritos / ajustes si aplican.

### Perfil público (si usas slug)

- Abrir `/u/[slug]` de un usuario conocido: perfil público sin datos sensibles incorrectos.

## Correos (diario / semanal)

- No hay “simulación Gmail” en el repo por defecto; la verificación es **envío de prueba** desde cron con `RESEND_API_KEY` o revisar HTML generado llamando a `buildDailyHtml` / `buildWeeklyHtml` desde un script temporal en desarrollo.

---

*Última actualización: alineado con rutas del footer / navegación principal del proyecto.*
