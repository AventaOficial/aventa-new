# Aventa — Launch Ready Gate

Fecha: 2026-10-04. Producción: `aventaofertas.com`, Supabase `mkgsrpsuvedwwlzmzmzh`. Staging: Supabase `oojshofrpbfwsiypcecr`.

Veredicto: **GO WITH CONDITIONS**. No hay P0 ni P1 abiertos en código. Las condiciones son acciones del owner: backups (Supabase Pro) y catálogo vivo antes de abrir tráfico.

Cambios de código de esta fase: PR [#43](https://github.com/AventaOficial/aventa-new/pull/43), merge `0d97401`, desplegado y verificado en producción. Sin migraciones.

## Matriz

| Sistema | Estado | Severidad | Bloquea Launch | Acción |
|---|---|---|---|---|
| Nota interna de lote en fichas públicas (11 ofertas) | Cerrado en #43 | — (era P1) | No | — |
| Canonical / og:url de home y Plaza apuntaban a `*.vercel.app` | Cerrado en #43 | — (era P1) | No | — |
| Sitemap sin URLs de ofertas | Cerrado en #43 | — (era P2) | No | — |
| Escrituras staff en tablas de dinero con freeze (clawback, atribución manual, pool `paid`) | Cerrado en #43 | — (era P1) | No | — |
| Money path | FROZEN / VERIFIED | — | No | Mantener `MONEY_PATH_FROZEN` |
| Backups / restore | Sin backups gestionados (plan free) | OWNER ACTION | Sí | Upgrade Supabase a Pro + verificar backups/restores |
| Catálogo vivo | 12 vivas; todas vencen hoy 2026-10-05 00:59–01:43 UTC | OWNER ACTION | Sí, para abrir tráfico | Cargar y aprobar un lote nuevo |
| Oferta pendiente con 47 h | SLA de moderación roto | P2 / OWNER ACTION | No | Moderarla |
| Smoke de escrituras (comentar, like, aprobar/rechazar, logout) | No ejecutado; requiere sesión en staging | OWNER ACTION | No | Correr el checklist de abajo en staging |
| Capacidad > 25 concurrentes | No medible: Vercel Firewall desafía la ráfaga | P2 / OWNER ACTION | No | Allowlist temporal si se quiere medir |
| Medición de adquisición (UTM / analytics) | No existe | P2 | No | Decidir antes de pagar adquisición |
| Hardening Supabase (search_path, grants latentes, leaked password protection) | Abierto | P3 | No | Backlog |
| Allocations `void`/`pending` con freeze, carrera del cron bridge, evidencia Amazon `approved` | Abierto, no mueve dinero | P2 | No | Backlog |
| `getPublicAppOrigin` cae a `VERCEL_URL` | Abierto | P3 | No | Corregir antes de activar distribución |
| og:url de Plaza = home; home sin JSON-LD; título con `&#39;` | Abierto | P3 | No | Backlog |

## Verificación en producción tras #43

- Home: canonical, og:url y og:image en `https://aventaofertas.com`.
- Plaza: canonical `https://aventaofertas.com/plaza`.
- `sitemap.xml`: 12 URLs de oferta (las 12 vivas, ninguna con 404/410 confirmado).
- Oferta `d8bb8a67` (una de las 11): sin la nota de lote en el HTML, sin bloque "Sobre esta oferta", meta description "Oferta en Amazon. Precio 117.52". Indexable.
- `/oferta/<id>` sin slug: 308 a la URL canónica.
- `/api/health`: 200.
- `POST /api/webhooks/payouts/provider`: `{"code":"money_path_frozen","frozen":true}`.
- `clawback`, `attribute` y `PATCH pools` sin auth: 401.

## Las 11 ofertas con nota de lote

- Origen: tres escritores de lote rellenaban `description` con la nota cuando no había nota del hunter.
- Arreglo: los escritores ya no la guardan, y `publicOfferDescription` la oculta en ficha, metadata, JSON-LD y tarjetas.
- La base no se tocó; los moderadores la siguen viendo. Precio, afiliación, votos, creador, lifecycle y dinero intactos.

## Catálogo (producción, solo lectura)

| Clase | Significado | Ofertas |
|---|---|---|
| A | Viva, verificada disponible | 0 |
| B | Viva, escaneo sin dato | 0 |
| C | Viva, requiere verificación (`missing_discount_price` 6, `missing_title` 6; ningún 404/410) | 12 |
| D | Confirmada agotada/retirada (404/410) | 0 |
| E | Vencida, fuera del feed (58 `missing_discount_price`, 11 `missing_title`, 1 `available`) | 70 |
| F | Contenido incompleto (nota de lote; ya oculta) | 11 (dentro de C) |
| G | Contenido con defecto de formato (título con `&#39;`) | 1 (dentro de C) |

- De los 81 `out_of_stock`, ninguno tiene 404/410. Son fallos de parseo del escaneo de 03:46 UTC, anterior a #39. El escaneo de las 03:00 UTC los reclasifica como `unknown`. No se modificó ningún dato.
- `live_in_24h = 0`: el feed queda vacío alrededor de las 19:43 hora de México de hoy si no entra un lote nuevo.

## Smoke funcional

Ejecutado en producción con la sesión del owner:
- Favorito: agregar, persistir, ver en `/me/favorites` y quitar. Única escritura controlada: oferta `9924db0d`, 2026-10-04 20:55:59 UTC, revertida; quedan 0 favoritos.
- Lectura: centro de notificaciones (nada marcado como leído), panel de moderación (no se moderó), `/me` y la vista CEO de pagos (composición de referencia; `payout_intents = 0`).

Pendiente, en staging con sesión de owner/moderador:
1. Login. Abrir una oferta de staging.
2. Comentar; recargar; el comentario persiste. Borrarlo.
3. Like al comentario y quitarlo; el contador vuelve.
4. Votar y quitar el voto.
5. Subir una oferta con imagen (jpg ≤ 2 MB) desde "Subir oferta"; queda `pending`.
6. Moderación: aprobar esa oferta; aparece en el feed. Rechazar otra; no aparece.
7. Notificaciones: la aprobación genera notificación al autor.
8. `/me`: puntos y nivel coherentes tras la aprobación.
9. CEO dashboard: carga sin errores; sin botones de dinero.
10. Logout; `/me` redirige a login.

## Seguridad

- P0 = 0, P1 = 0.
- HTTP: ~30 endpoints sensibles responden 401 sin token y con Bearer falso. 25 bundles de producción sin secretos.
- RLS: escrituras públicas exigen `auth.uid() = user_id` o rol admin. No hay escrituras anónimas.
- Storage: solo `offer-images`, lectura pública; la subida pasa por API autenticada con límite de tamaño y tipo.
- P3:
  - 2 vistas SECURITY DEFINER de lectura curada.
  - 2 funciones con `search_path` mutable.
  - Grants latentes de escritura en tablas de dinero, bloqueados por RLS sin políticas.
  - Leaked password protection desactivada.

## Dinero

**MONEY = FROZEN / VERIFIED.**

- `isMoneyPathFrozen()` es fail-closed en producción.
- Auditoría de 19 rutas: crear reward, liberar holds, reservar/enviar/confirmar payout, payout SPEI, liquidar comisión, recuperación de reversos y lotes de payout-ops están detrás del freeze.
- #43 cierra las tres escrituras staff que lo ignoraban.
- En producción: `payout_intents = 0` y el webhook de payouts responde `money_path_frozen`.

## Capacidad (staging)

- 10 concurrentes: p50 168 ms, 20/20 OK.
- 25 concurrentes: OK (baseline previo).
- 50 y 100: no medibles. Vercel Firewall responde 403 challenge a ráfagas de una sola IP. Es protección de plataforma, no un límite de la app.
- DB staging: 12–13 conexiones de 60.
- No se afirma un número de usuarios soportados.

## Adquisición (solo verificado, nada activado)

- Existen: `acquisition_sources` con 5 filas, `acquisition_scouts` vacía.
- `offer_events`: 415 (sin columnas de fuente/UTM). `product_events`: 0 (tabla creada hoy, esperado).
- No hay paquete de analytics web. La distribución por Telegram está inactiva.

## Backup

**OWNER ACTION — SUPABASE PRO.** El plan free no tiene backups gestionados ni PITR, y no se inventó un sustituto. Acción: upgrade a Pro, confirmar el backup diario en el dashboard y hacer una prueba de restore a un proyecto aparte.
