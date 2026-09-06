# CONTROL Baseline — Sistema actual

**Evidence:** E3 (código)  
**Scope:** flujos consumidor públicos / autenticados. Admin/staff se listan como rutas existentes sin deep-dive de tarea HSE.

---

## 1. Auth y gates

| Mecanismo | Hecho (E3) | Archivo |
|---|---|---|
| Middleware paths protegidos | `/me`, `/settings`, `/mi-panel`, `/contexto`, `/operaciones`, `/admin/*`, `/equipo/*` → redirect `/` sin sesión | `middleware.ts` |
| Login/register routes | **No existen** `/login` ni `/register` | — |
| Auth UI | Modal `RegisterModal` / onboarding vía `UIProvider.openRegisterModal` | `app/providers/UIProvider.tsx`, `OnboardingV1.tsx` |
| Métodos | Email/password + Google OAuth → `/auth/callback` | `AuthProvider.tsx`, `app/auth/callback/route.ts` |
| Reset password | `/auth/reset-password` | `app/auth/reset-password/page.tsx` |
| Deep link legacy | `/?o=<uuid>` → 301 `/oferta/<uuid>` | `middleware.ts` |

---

## 2. Rutas consumidor (inspeccionadas)

### Públicas (middleware no exige sesión)

| Ruta | Archivo | Rol en journey |
|---|---|---|
| `/` | `app/page.tsx` | Home / DISCOVERY |
| `/oferta/[id]` | `app/oferta/[id]/page.tsx` + `OfferPageContent.tsx` | Detalle / EVALUATION–ACTION |
| `/categoria/[slug]` | `app/categoria/[slug]/page.tsx` | Discovery por categoría |
| `/categoria/[slug]/[subslug]` | `app/categoria/.../[subslug]/page.tsx` | Subcategoría |
| `/tag/[slug]` | `app/tag/[slug]/page.tsx` | Tag |
| `/tienda/[slug]` | `app/tienda/[slug]/page.tsx` | Por tienda |
| `/descubre` | `app/descubre/page.tsx` | Guías |
| `/plaza` | `app/plaza/page.tsx` | Comunidad (writes requieren sesión en cliente) |
| `/u/[username]` | `app/u/[username]/page.tsx` | Perfil público |
| `/subir` | `app/subir/page.tsx` | Redirect a `/?upload=1…` |
| `/comisiones` | `app/comisiones/page.tsx` | Info comisiones |
| `/extension`, `/extension/auth` | `app/extension/*` | Extensión |
| `/privacy`, `/terms` | legales | — |
| `/auth/reset-password` | recovery | — |

### Autenticadas (middleware)

| Ruta | Archivo |
|---|---|
| `/me` | `app/me/page.tsx` |
| `/me/favorites` | `app/me/favorites/page.tsx` |
| `/me/estadisticas` | `app/me/estadisticas/page.tsx` |
| `/settings` | `app/settings/page.tsx` |

### Admin / staff (existen; fuera del foco TASK consumidor)

Prefijos `/admin/*`, `/equipo/*`, `/operaciones/*`, `/mi-panel`, `/contexto` — gated. No modelados como TASK-001…015.

---

## 3. Componentes consumidor clave

| Componente | Uso verificado |
|---|---|
| `OfferCard` | Cards del feed / perfiles; voto, favorito, CTA a detalle, view tracking |
| `FeaturedOfferCard` | Carrusel highlights en tab `top` |
| `OfferPageContent` | Detalle vivo en `/oferta/[id]` |
| `OfferModal` | **Implementado** en `app/components/OfferModal.tsx` pero **sin imports** en pages/consumers (grep vacío) → **no montado en CONTROL actual** |
| `ActionBar` | Nav móvil/desktop + modal de publicación |
| `Hero` / `SearchField` | Entrada / búsqueda en Home |
| `HomeDesktopRail` | Filtro tiendas `xl:` |
| `RegisterModal` / Onboarding | Auth UI |
| `ClientLayout` | Shell con ActionBar |

---

## 4. Home — comportamiento (E3)

Fuente: `app/page.tsx`, `lib/offers/homeFeedClient.ts`

| Aspecto | Comportamiento |
|---|---|
| Feed sin búsqueda | `GET /api/feed/home` |
| Tab «Para ti» | Solo con `session`; `GET /api/feed/for-you` + Bearer |
| Búsqueda | Debounced; cliente Supabase vista `ofertas_ranked_general` |
| Tabs `viewMode` | `vitales` \| `top` \| `latest` \| `personalized` |
| `top` | `timeFilter`: day \| week \| month |
| `vitales` | chips categoría `DIA_A_DIA_FILTERS` |
| Store filter | `HomeDesktopRail` (xl) |
| Click card | `router.push` a path público de oferta |
| CTA «Ver oferta» en card | `POST /api/events` `cazar_cta` + navigate a detalle (no abre tienda) |
| Outbound tienda | Solo en detalle (`trackAndOpenOfferUrl`) |

---

## 5. Detalle de oferta (E3)

Server `app/oferta/[id]/page.tsx`: carga oferta `approved`, no expirada; `notFound` / redirect canónico.

Cliente `OfferPageContent`: precio, imágenes, tienda, autor, votos, favorito, share, report, comentarios, CTA outbound «Ver si sigue disponible».

---

## 6. Publicación (E3)

1. `/subir` → `/?upload=1…`  
2. Home `openUploadModal()` → UI en `ActionBar.tsx`  
3. Gate URL: `POST /api/parse-offer-url` (Bearer) o continuar sin enlace  
4. Imágenes: `POST /api/upload-offer-image`  
5. Submit: `POST /api/offers` (Bearer)  
6. Cooldown: `GET /api/me/upload-cooldown-status`  
7. Sin sesión al subir: `openRegisterModal('signup')`

---

## 7. Mobile vs desktop (E3)

| Superficie | Mobile (`md:hidden` / &lt;md) | Desktop (`md:` / `xl:`) |
|---|---|---|
| ActionBar | Tabbar: Inicio, Guía, Subir, Favoritos, Perfil — **sin Plaza** | Sidebar: + **Plaza** |
| Home tabs | Segmented | Pills |
| Search | En Hero | Sticky `hidden md:block` |
| Rail tiendas | Oculto | `xl:block` |
| Padding | `pb-32` (tabbar) | `md:pb-12` |
| Upload modal | Steps 1/2 | Secciones en columnas |

---

## 8. User models × rutas relevantes (sin tiempos)

| USER | Tareas ancla | Rutas/componentes relevantes (E3) |
|---|---|---|
| A nuevo | 001,003,004,006 | `/`, `/oferta/[id]`, RegisterModal |
| B casual | 001,007,013 | `/`, ActionBar Favoritos, `/me/favorites` |
| C cazador | 003,005,006,008 | Detalle, votos, outbound |
| D precio | 002,003,005,006 | categoría/tienda/filtros, detalle |
| E recurrente | 013,012,007,008 | `/me`, favoritos, tabs Para ti |
| F publicador | 010,011 | upload modal, `/me` |
| G baja tech | 001,004,006,014 | ActionBar móvil, detalle |
| H móvil | 014 | tabbar, layout mobile |
| I desktop | 015 | sidebar, rail, search sticky |
| J eficiencia | 006,001,013 | CTA outbound, tabs |

Capacidades necesarias: UNKNOWN a nivel de skill real; **precondiciones de sistema**: sesión para voto/favorito/publicar/comentarios write; middleware para `/me*`.

---

## 9. Interaction baseline template (vacío de valores)

Usar en corridas futuras (HSE-02+):

```text
TASK | USER MODEL | STEP | INTERACTION | SCREEN | DECISION | ERROR | RECOVERY | OUTCOME
```

HSE-01 no rellena filas con conteos de usuarios reales.
