# Repositorio público — política de contenido

AVENTA mantiene este repositorio **público** de forma intencional (transparencia de ingeniería, colaboración). Eso implica que **cualquier persona puede leer el código y la documentación versionada**.

## Qué no debe subirse nunca

- Claves, tokens, `.env` reales, dumps de base de datos, CSV/JSON con PII o UUIDs de usuarios reales.
- Reportes de canarios (`scripts/_m*_reports/`), lecturas de prod (`scripts/_dq_prod_reports/`), snapshots de QA en `scripts/_catalog_quality_reports/` o `scripts/_rewards_staging_reports/`.
- Documentación competitiva detallada o estrategia frente a marcas de terceros → solo en `docs/_private/` (ignorada por git) o en un repo interno.

Antes de `git push`, revisa `git status` y no fuerces (`-f`) artefactos ignorados.

## Qué sí puede estar en público

- Código de la aplicación, tests, migraciones documentadas en `docs/supabase-migrations/` (sin credenciales).
- `lib/databaseAtlas/*.snapshot.json`: **solo nombres de tablas/vistas** y metadatos de esquema; `projectRef` va **redactado**. No incluye filas de datos.
- Referencias de proyecto Supabase en código (`lib/supabase/projectRefs.ts`): necesarias para aislar staging/prod; la seguridad real está en **RLS y rotación de service role**, no en ocultar el ref.

## Marcas de terceros

- En **producto** (web, extensión, anuncios): no usar nombres de competidores ni implicar afiliación con ellos. Las tiendas (Amazon, Mercado Libre, etc.) solo en contexto de oferta + disclaimers de afiliado.
- En **docs públicas**: evitar comparativas nominativas; usar lenguaje genérico («foros de ofertas consolidados»).

## Si algo sensible se publicó por error

1. Rotar la credencial afectada de inmediato.
2. Quitar el archivo del árbol (`git rm`) y abrir PR.
3. Si hubo secretos o PII, valorar limpieza de historial (`git filter-repo`) o asistencia de GitHub.

## Contacto

Dudas legales o de privacidad: `aventasoportelegal@gmail.com` (ver también `/privacy` y `/terms` en producción).
