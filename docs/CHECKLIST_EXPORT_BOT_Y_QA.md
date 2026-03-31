# AVENTA — Checklist exportable (bot, QA, post-lanzamiento)

**Uso:** imprimir o exportar a PDF desde el editor (p. ej. Markdown PDF, imprimir a PDF).  
**Referencia completa del sistema:** `docs/CONTEXTO_SISTEMA_AVENTA.md`

---

## A. Seguridad (hacer ya si filtraste secretos)

Si alguna credencial (Redis, tokens, URLs con contraseña) apareció en chat, email o captura:

- [ ] **Rotar** token/clave en el proveedor (Upstash, etc.).
- [ ] **Actualizar** la variable en Vercel y redeploy.
- [ ] **No** volver a pegar secretos en hilos de chat.

---

## B. Bot — requisitos mínimos

- [ ] `BOT_INGEST_ENABLED=1`
- [ ] `BOT_INGEST_USER_ID` = UUID existente en Supabase Auth
- [ ] `SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `CRON_SECRET` (mismo valor que usa Vercel al llamar crons)
- [ ] Al menos una fuente: **`BOT_INGEST_URLS`** y/o **`BOT_INGEST_DISCOVER_ML=1`** y/o **`BOT_INGEST_AMAZON_ASINS`**
- [ ] `app_config.bot_ingest_paused` = false (o sin fila) — panel Operaciones / Trabajo
- [ ] Cron `*/api/cron/bot-ingest` activo en el proyecto desplegado

### B.1 Afiliados (enlaces que monetizan)

- [ ] Amazon: `AMAZON_ASSOCIATE_TAG` / `NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG` (ya los tienes)
- [ ] Mercado Libre: `ML_AFFILIATE_TAG` o `NEXT_PUBLIC_ML_AFFILIATE_TAG` si publicas enlaces ML (revisar `lib/affiliate/applyPlatformAffiliateTags.ts`)

### B.2 Tu Vercel hoy — huecos típicos con solo URL + básicos

Con **solo** `BOT_INGEST_URLS` el bot depende de esa lista (manual). Para **menos mantenimiento**:

- [ ] Añadir **`BOT_INGEST_DISCOVER_ML=1`** (descubrimiento por API ML + defaults o queries en env).
- [ ] Opcional: **`BOT_INGEST_DAILY_MAX`**, **`BOT_INGEST_TIMEZONE`**, **`BOT_INGEST_NORMAL_MAX_MIN` / `MAX`**, boost matutino — ver `.env.example` (valores por defecto en código si no los pones).

**Nota:** `BOT_INGEST_MAX_PER_RUN` sigue existiendo en config; el motor v3 prioriza el rango normal 1–3 y el boost/tope diario. Puedes dejarlo alineado con lo que muestra el panel o documentar un valor coherente.

---

## C. QA web (post-lanzamiento, repetir tras cada cambio grande)

### C.1 Público

- [ ] Home carga; filtros y scroll
- [ ] `/oferta/[id]`: datos correctos; **Ver oferta en tienda** con tag afiliado
- [ ] Registro / login / logout
- [ ] Términos y privacidad accesibles

### C.2 Usuario logueado

- [ ] Subir oferta (parseo + envío)
- [ ] Votos y favoritos
- [ ] Comentario (y reporte si aplica)
- [ ] Perfil público

### C.3 Tracking

- [ ] Network: `POST /api/track-outbound` → 204 al ir a tienda (modal y página de oferta)
- [ ] Sin sesión y con sesión

### C.4 Admin

- [ ] Moderación: aprobar / rechazar
- [ ] Oferta aprobada visible en feed
- [ ] Estado del bot y “Ejecutar ahora”

### C.5 Móvil y salud

- [ ] Flujos críticos en viewport móvil
- [ ] `GET /api/health` OK

---

## D. Menos dependencia de ti — qué hacer ahora (orden sugerido)

Objetivo: **alertas automáticas** y **superficies de control** para que el sistema avise antes de romperse.

### D.1 Esta semana (alto impacto / bajo esfuerzo)

1. **Vercel:** activar **Observability** / alertas de error en deploy y en **Cron** (fallos en `/api/cron/bot-ingest` y `process-write-queue` si lo usas).
2. **Cron de integridad:** asegurar `SYSTEM_ALERT_EMAIL_TO` + `RESEND` (ya tienes) o **webhook** (`SYSTEM_ALERT_WEBHOOK_URL`) para `/api/cron/system-integrity` — recibes aviso sin entrar al panel.
3. **Bot:** en Operaciones, revisar una vez **`bot-ingest-status`**: `env_missing`, `inserted_today_approx`. Si todo verde, solo miras cuando llegue alerta.
4. **Mercado Libre:** si el feed es mayormente ML, configurar **`ML_AFFILIATE_TAG`** (o `NEXT_PUBLIC_…`) para no dejar enlaces sin comisión.

### D.2 Próximas 2–4 semanas

5. **Uptime externo** (Better Stack, UptimeRobot, etc.): ping a `https://tu-dominio/api/health` cada 5 min.
6. **Sentry** (o similar) en Next.js: errores de cliente/servidor con notificación.
7. **Vista SQL o mini admin:** consulta guardada en Supabase (o página admin mínima) — top `offer_id` por `outbound` últimos 7 días; así ves qué vende sin Excel manual.
8. **Cola de eventos:** confirmar `EVENT_WRITE_MODE=adaptive` y que el cron **`process-write-queue`** esté en `vercel.json` y sin fallar (evita pérdida de clics bajo pico).

### D.3 Cuando escales tráfico

9. **Rate limits** ya con Upstash: revisar presets si ves 429 masivos.
10. **Unificar parseo** URL (bot + `/api/parse-offer-url`) en un solo módulo — menos sorpresas cuando ML/Amazon cambian.
11. **Ranking por datos:** usar agregados de clics para subir/bajar visibilidad en feed (producto, no solo ingeniería).

---

## E. Criterio “puedo no mirar cada día”

- Alertas de **cron fallido** + **health down** + **integridad** llegan a tu correo o Slack.
- Bot: **pausa en un clic** en Operaciones si algo sale mal.
- Una **vista** (SQL o admin) de clics/semana por oferta revisada **1 vez por semana**, no cada hora.

---

**Modo “yo solo moderó el bot” y ~50 ofertas/día:** `docs/BOT_MODO_SOLO_MODERACION.md`

---

*Documento para exportar / imprimir. Mantener alineado con `CONTEXTO_SISTEMA_AVENTA.md`.*
