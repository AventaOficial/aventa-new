# Checklist de lanzamiento — AVENTA

**Uso:** Verificación final antes de lanzar a producción. Revisar cada ítem y marcar cuando esté listo.

---

## 1. Funcionalidad y UX

| Ítem | Estado | Notas |
|------|--------|-------|
| Registro con Google | ✅ | Trigger crea perfil; sync-profile como respaldo. |
| Inicio de sesión / cierre de sesión | ✅ | Flujo con callback y cookies. |
| Publicar oferta (formulario, precios, imágenes) | ✅ | Precios redondeados a 2 decimales en front y API. |
| Ver ofertas (home, filtros, búsqueda, paginación) | ✅ | Vista ranked; cursor en latest/personalized. |
| Abrir oferta extendida (modal) | ✅ | CAZAR OFERTA + Reportar más compactos en desktop. |
| Botón "CAZAR OFERTA" (ir al enlace externo) | ✅ | Track outbound; rate limit 1/(user,offer,10min). |
| Compartir oferta | ✅ | Copia enlace y evento share. |
| Reportar oferta | ✅ | Modal con tipo y comentario; POST /api/reports. |
| Votar (arriba/abajo) | ✅ | API con user desde token; UNIQUE por oferta/usuario. |
| Favoritos | ✅ | Añadir/quitar; lista en /me/favoritos. |
| Comentarios en oferta | ✅ | GET/POST /api/offers/[id]/comments; solo aprobados visibles. |
| Perfil público por username | ✅ | /u/[username] y API con RPC get_profile_by_slug. |
| Mi perfil / Mis ofertas | ✅ | /me con ofertas propias. |
| Configuración (nombre, etc.) | ✅ | /settings con límite 14 días en cambio de nombre. |
| Enlaces a Privacidad y Términos | ✅ | Footer y páginas /privacy y /terms. |

**Botones sueltos:** No se detectan botones huérfanos; acciones principales (subir oferta, votar, comentar, reportar, favoritos, compartir) están enlazadas a APIs o modales.

---

## 2. Moderación

| Ítem | Estado | Notas |
|------|--------|-------|
| Moderación de ofertas (pendientes / aprobar / rechazar) | ✅ | /admin/moderation; POST /api/admin/moderate-offer. |
| Moderación de comentarios | ✅ | /admin/moderation/comments; GET/PATCH /api/admin/comments (pending/approved/rejected). |
| Reportes de usuarios | ✅ | /admin/reports; ofertas reportadas. |
| Logs de moderación | ✅ | moderation_logs; panel /admin/logs. |
| Roles (owner, admin, moderator, analyst) | ✅ | user_roles; RLS y requireModeration/requireAdmin. |

---

## 3. Legal

| Ítem | Estado | Notas |
|------|--------|-------|
| Términos y Condiciones | ✅ | /terms con naturaleza del servicio, registro, contenido, enlaces externos, limitación de responsabilidad. |
| Política de Privacidad | ✅ | /privacy con responsable, datos, finalidades, cookies, terceros (Supabase, Google, Vercel, Upstash). |
| Aviso "no sustituye asesoría legal" | ✅ | En ambas páginas. |
| Enlaces en footer | ✅ | Privacidad y Términos accesibles. |
| Correo de contacto en Privacidad | ⚠️ | Placeholder: "El titular del proyecto deberá indicar aquí un correo de contacto válido." — **Sustituir por correo real antes de lanzar.** |

**¿Nos pueden demandar si inspeccionan el código?**  
- No hay marcas ajenas (Promodescuentos, Apple como marca comercial, etc.) usadas de forma que implique afiliación o competencia desleal.  
- Uso de "Apple": solo para detección de dispositivo (userAgent) y meta `appleWebApp` (estándar para PWA); no es uso de marca comercial.  
- Términos y Privacidad dejan claro que AVENTA no vende productos, que los precios y enlaces son de terceros y que el contenido es responsabilidad de los usuarios.  
- Riesgo bajo si los textos legales están publicados y el correo de contacto está indicado. Para mayor seguridad, revisión por abogado en México (LFPDPPP, competencia, defensa al consumidor) sigue siendo recomendable.

---

## 4. Código e inspección

| Ítem | Estado | Notas |
|------|--------|-------|
| Sin credenciales en repo | ✅ | .env* en .gitignore; solo .env.example sin valores reales. |
| Sin migraciones ni auditorías en repo público | ✅ | Eliminadas; .gitignore para migrations. |
| user_id / created_by siempre desde servidor | ✅ | Nunca desde body; validación con token. |
| Rate limiting (Upstash) | ✅ | Configurado en Vercel; límites por preset (offers, votes, events, etc.). |
| RLS y políticas Supabase | ✅ | Ajustes aplicados (offer_events, owner en is_moderator, etc.). |

Un tercero que inspeccione el código verá lógica de negocio y estructura; no verá esquema de BD ni informes de auditoría. No hay nada que por sí solo sea causa de demanda; lo crítico es tener Términos y Privacidad publicados y contacto real.

---

## 5. Pendientes antes de lanzar

- [ ] **Privacidad:** Sustituir el placeholder del correo de contacto por un correo válido (ej. legal@aventaofertas.com o contacto@aventaofertas.com).  
- [ ] **Vercel:** Confirmar que en Production están definidas: `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.  
- [ ] **Supabase:** Esquema y migraciones ya aplicados en el proyecto de producción.  
- [ ] **Google OAuth:** Redirect URIs y dominio verificados en consola de Google y en Supabase.  
- [ ] **Prueba de punta a punta:** Registrar usuario → publicar oferta → votar → comentar → reportar → (como moderador) aprobar/rechazar oferta y comentarios.

---

## 6. Resumen

- **Funcionalidad:** Completa para V1 (auth, ofertas, votos, comentarios, favoritos, reportes, moderación de ofertas y comentarios).  
- **Moderación de comentarios:** Implementada (panel y API).  
- **Legal:** Términos y Privacidad publicados; falta solo correo de contacto real en Privacidad.  
- **Riesgo por inspección de código:** Bajo; no hay uso indebido de marcas ni exposición de secretos.  
- **UI:** Barra CAZAR OFERTA + Reportar más delgada en vista desktop en el modal de oferta.

Cuando el correo en Privacidad esté actualizado y las variables de Vercel/Supabase/Google estén verificadas, el proyecto está listo para lanzar.
