# Panel de Moderación — AVENTA

## Contexto del proyecto

**AVENTA** es una plataforma de ofertas tipo comunidad de ofertas (México). Stack: Next.js, Supabase, Vercel.

### Estado actual
- **Home:** Feed de ofertas con filtros (General, Top, Recientes, Para ti), votos tipo comunidad de ofertas (up +2, down -1)
- **OfferCard:** Muestra "Cazado por [usuario]", autor clickeable a `/u/[username]`
- **ActionBar:** Favoritos y Perfil visibles siempre; sin sesión muestran toast "Para acceder hay que iniciar sesión"
- **Subir oferta:** Sin sesión abre modal de crear cuenta
- **Vistas /me, /u/[usuario], /me/favorites:** Lista vertical como home
- **Admin:** Panel con sidebar (Pendientes, Aprobadas, Rechazadas, Reportes, Usuarios, Logs, Métricas, Health)

### Archivos clave
- `app/admin/moderation/page.tsx` — Panel moderación
- `app/admin/metrics/page.tsx` — Métricas
- `app/admin/health/page.tsx` — System health
- `app/admin/components/ModerationOfferCard.tsx` — Card de oferta en moderación

---

## Modelo completo de moderación (objetivo a largo plazo)

### Principio fundamental
- AVENTA no paga por publicar ni por votar.
- AVENTA paga por **impacto validado**: clicks reales, engagement legítimo, comisión afiliada confirmada, oferta sin fraude.
- La moderación es un **sistema multinivel automatizado** con intervención humana mínima.

### Niveles del sistema
1. **Nivel 0** — Prevención creación masiva (email verificado, CAPTCHA, rate limit, IP/device hash)
2. **Nivel 1** — Filtro automático: risk_score (0–100) por oferta
3. **Nivel 2** — Publicación progresiva según risk y reputación
4. **Nivel 3** — user_trust_score (0–100)
5. **Nivel 4** — Reportes ponderados por trust del reporter
6. **Nivel 5** — Detección de colusión (votos recíprocos, IP compartidas)
7. **Nivel 6** — Retención económica 7–14 días
8. **Nivel 7** — Penalización escalonada (advertencia → ban)
9. **Nivel 8** — Moderación humana (1% casos)

### Requisitos técnicos
- Log de cambios de estado
- Log de penalizaciones
- Log de ajustes manuales
- risk_score en ofertas
- user_trust_score en perfiles
- Sistema de reportes estructurados

### Lo que rompería todo
- No tener risk_score automático
- No ponderar reportes por reputación
- No detectar colusión
- No tener retención económica
- No tener logs
- No tener penalización escalonada
- No separar visibilidad por trust_score

---

## Próximos pasos sugeridos

1. **Fase 1** — ✅ UI del panel (layout, navegación, cards, acciones)
2. **Fase 2** — ✅ risk_score en ofertas (columna + trigger)
3. **Fase 3** — ✅ Sistema de reportes y logs
4. **Fase 4** — user_trust_score y ponderación

---

## Restricciones

- No romper funcionalidad existente
- Mantener diseño mobile del home
- Solo tocar lo necesario para la tarea
- Responder en español
