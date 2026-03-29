/**
 * Registro manual de control de producto (última vez que tocaste / revisaste / diste OK por área).
 * Actualiza estas fechas en código cuando despliegues o audites; es la fuente de verdad visible en
 * Centro de operaciones. Formato ISO fecha (YYYY-MM-DD).
 */
export type ProductControlStatus = 'ok' | 'pendiente' | 'riesgo';

export type ProductControlEntry = {
  id: string;
  area: string;
  descripcion: string;
  ultimoCambio: string;
  ultimaRevision?: string;
  /** Cuando declaraste explícitamente “listo para producción” en esa área */
  ultimoOk?: string;
  estado: ProductControlStatus;
  notas?: string;
};

export const PRODUCT_CONTROL_AREAS: ProductControlEntry[] = [
  {
    id: 'feed-para-ti',
    area: 'Feed “Para ti”',
    descripcion: 'API /api/feed/for-you: preferred_categories + afinidad favoritos/votos, ventana 30 días.',
    ultimoCambio: '2026-03-27',
    ultimaRevision: '2026-03-27',
    ultimoOk: '2026-03-27',
    estado: 'ok',
  },
  {
    id: 'feed-home',
    area: 'Feed home / API feed/home',
    descripcion: 'Contratos Zod, vista=personalized sin sesión corregido en cliente.',
    ultimoCambio: '2026-03-27',
    ultimaRevision: '2026-03-27',
    estado: 'ok',
  },
  {
    id: 'pwa',
    area: 'PWA / icono / manifest',
    descripcion: 'Icono alineado con marca (AventaIcon), manifest y apple-icon.',
    ultimoCambio: '2026-03-27',
    ultimaRevision: '2026-03-27',
    estado: 'ok',
  },
  {
    id: 'admin-operaciones',
    area: 'Centro de operaciones',
    descripcion: 'Rutas bajo /admin/operaciones; índice por zonas; registro de control.',
    ultimoCambio: '2026-03-27',
    ultimaRevision: '2026-03-27',
    estado: 'ok',
  },
  {
    id: 'moderacion',
    area: 'Moderación de ofertas',
    descripcion: 'Cola pendientes, reglas y equipo.',
    ultimoCambio: '—',
    estado: 'pendiente',
    notas: 'Actualiza cuando cierres un ciclo de revisión.',
  },
  {
    id: 'legal',
    area: 'Legales / privacidad / términos',
    descripcion: 'Enlaces en footer y textos vigentes.',
    ultimoCambio: '—',
    estado: 'pendiente',
  },
  {
    id: 'fase2-comunidad',
    area: 'Fase 2 — Comunidad / solicitudes',
    descripcion: 'Documentado en docs/FASE2_COMUNIDAD_SOLICITUDES.md; sin implementar.',
    ultimoCambio: '2026-03-27',
    estado: 'pendiente',
    notas: 'Post-lanzamiento.',
  },
];
