# Prompt para continuar en nuevo chat — AVENTA

## Cómo usar

1. Abre un nuevo chat en Cursor.
2. Copia y pega el **PROMPT RÁPIDO** (abajo) como primer mensaje.
3. O bien copia el **BLOQUE DE CONTEXTO** + **TAREA ESPECÍFICA** para más detalle.

---

## PROMPT RÁPIDO (copiar y pegar en el nuevo chat)

```
@PROMPT_CONTINUAR_CHAT.md 

Lee el archivo adjunto. Contiene el contexto completo del proyecto AVENTA (Supabase, diseño, flujo actual de onboarding). 

Implementa el onboarding de 3 páginas descrito en la sección "TAREA ESPECÍFICA":
1) Bienvenida ("Bienvenido a AVENTA", "La mejor comunidad cazadora de ofertas", botón Continuar)
2) Cómo funciona (Subir, Votar, Guardar — coherente con página 1)
3) Crear cuenta / Iniciar sesión (panel auth integrado con Supabase)

Diseño calidad premium, full-screen overlay, transiciones suaves, responsive, dark mode. CTAs en negro #1d1d1f.
```

---

## BLOQUE DE CONTEXTO (copiar todo lo siguiente)

```
Proyecto: AVENTA — comunidad cazadora de ofertas (comunidad de ofertas refinada).

Stack: Next.js 15, React, TypeScript, Tailwind CSS, Supabase (auth + DB), Framer Motion.

## Supabase — Estructura principal

- **profiles**: id (FK auth.users), display_name, avatar_url, onboarding_completed (boolean), reputación (offers_submitted_count, etc.)
- **offers**: ofertas con title, price, original_price, store, image_url, offer_url, description, steps, conditions, coupons, status (pending/approved/rejected), created_by, upvotes_count, downvotes_count, ranking_momentum
- **offer_votes**: votos +2/-1 (modelo up +2 down -1)
- **comments**: comentarios por oferta (offer_id, user_id, content)
- **offer_events**: view, outbound, share (métricas)
- **offer_favorites**: favoritos por usuario
- **offer_reports**: reportes de ofertas
- **user_roles**: admin, moderator, analyst (RBAC)
- **moderation_logs**: logs al aprobar/rechazar
- Vista: **ofertas_ranked_general** — ranking con score, score_final, ranking_momentum

Auth: Supabase Auth (email/password). Trigger crea perfil al registrarse.

## Diseño y estética

- Fondo: #F5F5F7 (claro), #1d1d1f (oscuro) — estilo Apple
- CTA principal: bg-[#1d1d1f] (negro hero), hover: #2d2d2f
- Acentos: violet-600, purple-600 para estados activos
- Tipografía: SF Pro / system-ui, tracking-tight
- Transiciones: cubic-bezier(0.25, 0.1, 0.25, 1)
- Mobile-first, sidebar en PC (ActionBar)

## Flujo actual de onboarding

- **OnboardingV1.tsx**: componente principal. Muestra:
  1. showRegisterModal → RegisterModal (crear cuenta / iniciar sesión)
  2. showGuide → Guía de 3 pasos (Subir oferta, Votar, Guardar) con slider
  3. showPendingMessage → "Revisa tu correo para verificar"
- **UIProvider**: controla showGuide, showRegisterModal, profileOnboardingCompleted, openGuide(), finalizeOnboarding()
- Onboarding automático: primera visita (guest) o usuario sin onboarding_completed → abre showGuide
- Tras registro: onJustSignedUp → openGuide() (muestra guía)
- finalizeOnboarding() → actualiza profiles.onboarding_completed = true

## Rutas principales

- / — Home (feed ofertas, filtros General/Top/Para ti/Recientes)
- /communities — placeholder "Próximamente"
- /me, /me/favorites — perfil y favoritos
- /u/[username] — perfil público
- /settings — configuración
- /admin/moderation, /admin/reports, etc.

## APIs con rate limiting

- POST /api/offers — crear oferta (5/min)
- POST /api/reports — reportar (10/min)
- POST /api/offers/[id]/comments — comentar (20/min)
- POST /api/events — view/outbound/share (60/min)
```

---

## TAREA ESPECÍFICA: Onboarding de 3 páginas

Implementa un onboarding de 3 pantallas/pasos, diseño calidad Apple, coherente entre sí:

### Página 1 — Bienvenida
- Título: "Bienvenido a AVENTA"
- Subtítulo: "La mejor comunidad cazadora de ofertas"
- Botón "Continuar" (estilo CTA negro #1d1d1f)
- Diseño limpio, minimal, premium

### Página 2 — Cómo funciona
- Explicar lo que ya está en la guía actual: Subir oferta, Votar, Guardar
- Diseño coherente con la página 1
- Puedes reutilizar o rediseñar el contenido de GUIDE_STEPS en OnboardingV1
- Calidad visual premium, pensado para app

### Página 3 — Crear cuenta / Iniciar sesión
- Panel de auth (email, password, nombre si signup)
- Integrado con Supabase Auth (signIn, signUp del AuthProvider)
- Intuitivo, de calidad, mismo lenguaje visual que las páginas 1 y 2
- Opción de alternar entre "Crear cuenta" e "Iniciar sesión"

### Requisitos técnicos
- Sustituir o integrar con OnboardingV1.tsx actual
- Mantener flujo: UIProvider (showGuide, openGuide, finalizeOnboarding)
- Tras completar página 3 (registro o login) → finalizeOnboarding() y cerrar
- Guest que cierra sin registrarse → localStorage guestOnboardingDismissed
- Usuario que completa → profiles.onboarding_completed = true

### Diseño
- Full-screen overlay (como el actual)
- Transiciones suaves entre páginas (framer-motion)
- Responsive (mobile y desktop)
- Dark mode compatible
- Sin gradientes estridentes; negro #1d1d1f para CTAs
