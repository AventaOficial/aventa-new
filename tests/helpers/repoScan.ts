/**
 * Límite para las guardas que recorren y leen de forma síncrona todo `app/` y `lib/` (o el repo).
 * Es E/S acotada que no puede quedarse colgada: ~1–2 s en reposo, pero supera los 5 s por defecto
 * cuando varios workers leen los mismos miles de archivos a la vez (y en Windows con el antivirus
 * inspeccionando cada lectura). Solo cambia cuánto se espera, no lo que se comprueba.
 */
export const REPO_SCAN_TIMEOUT_MS = 30_000;
