# Checklist manual Vercel (sin IA)

Revisión de configuración en Vercel para AVENTA (aventaofertas.com). No hay asistente IA en Vercel; usar esta lista y comprobar en el dashboard.

## 1. Dominios y HTTPS

- [ ] **Dominio principal**: `aventaofertas.com` configurado en el proyecto.
- [ ] **SSL**: Certificado activo (Vercel suele asignarlo automáticamente).
- [ ] **Redirección**: Si usas `www`, que redirija a la raíz o viceversa según lo que tengas en Google (evitar duplicados).

## 2. Variables de entorno (producción)

En **Project → Settings → Environment Variables** (Production):

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` (solo servidor; no debe exponerse en cliente)
- [ ] `UPSTASH_REDIS_REST_URL`
- [ ] `UPSTASH_REDIS_REST_TOKEN`

Comprobar que no haya variables de desarrollo (por ejemplo, URLs con `localhost`) en Production.

## 3. Build y deploy

- [ ] **Rama**: Deploy automático desde `master` (o la rama que uses).
- [ ] **Build**: Último deploy en verde (sin errores).
- [ ] **Preview**: Opcionalmente, comprobar que los previews de PR no usen env de producción por error.

## 4. PWA y metadatos

- [ ] **Manifest**: `https://aventaofertas.com/manifest.webmanifest` responde 200 y el JSON es válido.
- [ ] **Iconos**: En el manifest, iconos 192x192 y 512x512 apuntan a URLs que cargan bien.
- [ ] **OG / meta**: En la home, `title` y `description` correctos; si quieres previews en redes, añadir `openGraph` y `twitter` en `metadata` del layout.

## 5. Headers y caché (opcional)

- En **Project → Settings** no suele hacer falta tocar headers si no tienes requisitos especiales.
- Para estáticos (JS/CSS/imágenes), Vercel aplica caché por defecto; solo revisar si necesitas políticas concretas (por ejemplo, no cachear HTML de una ruta concreta).

## 6. Resumen rápido

| Qué | Dónde | Estado |
|-----|--------|--------|
| Dominio + SSL | Domains | [ ] |
| Env vars producción | Settings → Environment Variables | [ ] |
| Build OK | Deployments | [ ] |
| Manifest PWA | URL /manifest.webmanifest | [ ] |
| OG/meta | layout.tsx / page.tsx | [ ] |

Cuando todo esté marcado, la configuración base en Vercel está lista para producción.
