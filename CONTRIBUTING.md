# Contribuir a AVENTA

Gracias por interesarte en el proyecto. Este repositorio es **público**; no subas datos operativos ni documentación interna sensible.

## Antes de abrir un PR

1. `npm test` (o el subconjunto que toque tu cambio).
2. Sin secretos en diff: revisa que no haya `.env`, tokens ni reportes bajo `scripts/_*/`.
3. Sin marcas de competidores en copy de usuario (`app/`, emails, landings).

## Artefactos locales (no commitear)

Los patrones en `.gitignore` cubren reportes de canarios, QA de staging/prod y capturas temporales. Si tu herramienta genera JSON en `scripts/`, déjalo local o en `docs/_private/`.

Política completa: [docs/SECURITY/PUBLIC_REPOSITORY.md](docs/SECURITY/PUBLIC_REPOSITORY.md).

## Estilo

Sigue las convenciones del archivo que edites (TypeScript estricto, copy en español para UI pública).
