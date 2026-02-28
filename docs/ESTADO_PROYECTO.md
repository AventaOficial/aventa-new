# Estado del proyecto AVENTA — Febrero 2026

**Uso:** Resumen interno para el equipo y para contexto en chats (Cursor/ChatGPT). No incluye detalles de seguridad ni esquema de base de datos.

---

## Stack

- Next.js 16, React 19, Supabase (Auth + DB + Storage), Upstash Redis (rate limiting), Vercel.
- Auth: solo Google OAuth. Perfiles creados con trigger en Supabase al registrarse.

---

## Estado actual

- **Auth y perfiles:** Registro con Google operativo. Trigger `handle_new_user` crea fila en `profiles`. Sync-profile como respaldo.
- **Rate limiting:** Upstash configurado en Vercel (Production y Preview). Variables: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Si faltan, se registra un aviso en logs y el límite no se aplica.
- **Precios:** Redondeo a 2 decimales en front y API para evitar errores de coma flotante (p. ej. 12000 no se guarda como 11998).
- **RLS y roles:** Políticas de Supabase revisadas (offer_events, offers, comments, etc.). Rol `owner` incluido en la lógica de moderación. Un solo trigger en `offer_votes` para métricas.
- **Perfil público:** API `/api/profile/[username]` usa RPC `get_profile_by_slug`; no se cargan todos los perfiles.

---

## Repo

- En el repositorio **no** se suben migraciones SQL ni documentación de auditorías/esquema (se mantienen en copia privada si hace falta). Solo código de la app y docs mínimos (README, UPSTASH_RATE_LIMITING, modelo-votos, moderación, etc.).

---

## Conclusión

Proyecto en estado **V1 sólida**: listo para tráfico controlado, con rate limit activo y sin documentación sensible en el repo público.
