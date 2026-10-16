# Limpieza de historial git (repo público)

El PR de sanitización **elimina del árbol actual** reportes de canarios, dumps de prod y docs competitivos. **Los commits antiguos en GitHub siguen conteniendo esos archivos** hasta que se reescriba el historial.

## Cuándo hacerlo

- Tras mergear la sanitización en `master`.
- Si hubo **claves reales** en algún commit: rotar credenciales **antes** y **después** de la limpieza.

## Opción recomendada (GitHub)

1. Settings → Code security → **Secret scanning** activo.
2. Si aparece un secreto en historial: usar **GitHub secret scanning push protection** / asistencia de soporte para revocar y purgar.

## Opción avanzada: `git filter-repo`

Solo con backup y aviso al equipo (todos deben re-clonar).

```bash
# Ejemplo: quitar carpetas sensibles de TODO el historial
pip install git-filter-repo
git clone --mirror https://github.com/AventaOficial/aventa-new.git aventa-mirror.git
cd aventa-mirror.git
git filter-repo --path scripts/_m54_reports/ --invert-paths
git filter-repo --path scripts/_m31_profiles.json --invert-paths
# repetir por cada patrón sensible o usar --paths-from-file
git push --force
```

Lista de paths a considerar: mismos patrones que `.gitignore` bajo `scripts/_m*`, `_dq_prod_reports`, `archived/docs/COMPARATIVA_*`.

## Qué no borra esto

- Refs de Supabase en código (`lib/supabase/projectRefs.ts`) — necesarios en runtime.
- Nombres de tablas en `lib/databaseAtlas/*.snapshot.json` — esquema sin filas.

Ver también [PUBLIC_REPOSITORY.md](./PUBLIC_REPOSITORY.md).
