# Checklist E2E — AVENTA Production Ready MVP

Ejecutar manualmente en producción o preview con dos cuentas (Usuario A / Usuario B) y una cuenta staff (mod/owner).

## TEST 1 — Registro
- [ ] Crear cuenta (Google OAuth o email)
- [ ] Aparece sesión / navbar con avatar

## TEST 2 — Publicar oferta (Usuario A)
- [ ] `/subir` o modal de upload
- [ ] URL ML o Amazon válida → metadata OK
- [ ] Oferta queda `pending` (o `approved` si auto-approve)

## TEST 3 — Duplicado
- [ ] Re-publicar misma URL/producto → **409** / mensaje de duplicado

## TEST 4 — Moderación (staff)
- [ ] Usuario normal **no** entra a `/admin/*`
- [ ] Mod aprueba oferta (link_mod_ok si aplica)

## TEST 5 — Feed
- [ ] Oferta approved visible en home / categoría

## TEST 6 — Voto ajeno (Usuario B)
- [ ] B ve la oferta y vota up
- [ ] Contadores / ranking se actualizan

## TEST 7 — Auto-voto bloqueado (Usuario A)
- [ ] A intenta votar su oferta → **403** "No puedes votar tu propia oferta"

## TEST 8 — Outbound / afiliado
- [ ] CTA abre URL con tag (creador si existe, si no plataforma)
- [ ] Evento `outbound` registrado (dedup 10 min)

## TEST 9 — Favoritos
- [ ] A o B guarda favorito; quitar favorito solo afecta al propio usuario

## TEST 10 — Owner / ops
- [ ] Owner entra a `/operaciones` y `/admin/owner`
- [ ] Bot "Ejecutar ahora" responde sin 500 (aunque inserte 0)

## TEST 11 — Comisiones (sin activar programa)
- [ ] `COMMISSION_PROGRAM_ACTIVE` sigue `false` en prod
- [ ] Split en código = **40% / 60%** (no pagar en vivo todavía)

## Criterio de salida
Si 1–10 pasan: flujo principal confiable para usuarios reales.
Si falla alguno P0 (auth, publicar, moderar, votar, auto-voto, admin gate): **NO LANZAR**.
