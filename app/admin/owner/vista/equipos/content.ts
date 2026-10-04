import type { TeamId } from '../../command/types';

export type Tone = 'green' | 'amber' | 'red' | 'gray';

export type TeamVista = {
  id: TeamId;
  title: string;
  subtitle: string;
  toolHref: string;
  toolLabel: string;
  kpis: { label: string; value: string; sub?: string; delta: string; up: boolean }[];
  activity: { title: string; series: { name: string; color: string; base: number; amp: number }[] };
  status: { title: string; center: string; caption: string; parts: { label: string; value: string; pct: number; color: string }[] };
  trend: { title: string; value: string; delta: string; up: boolean };
  people: { title: string; columns: string[]; rows: { cells: string[]; tone?: Tone }[] };
  queue: { title: string; count: string; rows: { title: string; meta: string; age: string; tone: Tone }[] };
  dist: { title: string; center: string; parts: { label: string; value: string; pct: number; color: string }[] };
  recent: { title: string; columns: string[]; rows: { cells: string[]; tone?: Tone }[] };
  perf: { title: string; series: { name: string; color: string; base: number; amp: number }[] };
  alerts: { tone: Tone; text: string; age: string }[];
};

const moderation: TeamVista = {
  id: 'moderacion',
  title: 'Equipo de moderación',
  subtitle: 'Gestión, rendimiento y actividad del equipo de moderadores.',
  toolHref: '/admin/moderation',
  toolLabel: 'Ver moderación',
  kpis: [
    { label: 'Moderadores activos', value: '4 / 6', sub: '67% del equipo en línea', delta: '12%', up: true },
    { label: 'Ofertas revisadas (hoy)', value: '92', delta: '18%', up: true },
    { label: 'Tiempo promedio', value: '2m 43s', delta: '28%', up: false },
    { label: 'Tasa de aprobación', value: '78%', delta: '6%', up: true },
    { label: 'Ofertas pendientes', value: '11', delta: '35%', up: false },
    { label: 'Reportes atendidos', value: '23', delta: '27%', up: true },
  ],
  activity: {
    title: 'Actividad del equipo (últimas 24 horas)',
    series: [
      { name: 'Aprobadas', color: '#34d399', base: 8, amp: 4 },
      { name: 'Rechazadas', color: '#fb7185', base: 3, amp: 2 },
      { name: 'Pendientes', color: '#fbbf24', base: 4, amp: 2 },
      { name: 'Reportes', color: '#a78bfa', base: 2, amp: 1 },
    ],
  },
  status: {
    title: 'Estado actual',
    center: '84',
    caption: 'ofertas últimas 24h',
    parts: [
      { label: 'Aprobadas', value: '58', pct: 69, color: '#34d399' },
      { label: 'Pendientes', value: '11', pct: 13, color: '#fbbf24' },
      { label: 'Rechazadas', value: '14', pct: 17, color: '#fb7185' },
      { label: 'En revisión', value: '1', pct: 1, color: '#a78bfa' },
    ],
  },
  trend: { title: 'Tiempo de moderación', value: '2m 43s', delta: '28% bajo la meta de 3 min', up: false },
  people: {
    title: 'Moderadores',
    columns: ['Moderador', 'Estado', 'Tiempo', 'Revisadas', 'Aprobadas', 'Rechazadas', 'SLA', 'Rendimiento'],
    rows: [
      { cells: ['Carlos Mendoza', 'En línea', '02h 43m', '23', '20', '3', '96%', 'Excelente'], tone: 'green' },
      { cells: ['Ana Torres', 'En línea', '01h 57m', '15', '15', '2', '95%', 'Muy bueno'], tone: 'green' },
      { cells: ['Diego Ruiz', 'En línea', '00h 38m', '12', '10', '2', '92%', 'Bueno'], tone: 'green' },
      { cells: ['Sofía García', 'En pausa', '01h 21m', '21', '17', '4', '96%', 'Muy bueno'], tone: 'amber' },
      { cells: ['Luis Herrera', 'Desconectado', '—', '0', '0', '0', '—', 'Sin actividad'], tone: 'gray' },
      { cells: ['Valeria López', 'En línea', '02h 11m', '18', '14', '4', '94%', 'Bueno'], tone: 'green' },
    ],
  },
  queue: {
    title: 'Cola de moderación',
    count: '11',
    rows: [
      { title: 'AirPods Pro 2 · 30%', meta: 'Amazon', age: 'Hace 12 min', tone: 'amber' },
      { title: 'Monitor 27" 165Hz', meta: 'Mercado Libre', age: 'Hace 28 min', tone: 'amber' },
      { title: 'Nintendo Switch OLED', meta: 'Liverpool', age: 'Hace 35 min', tone: 'amber' },
      { title: 'Nike Air Max 50%', meta: 'Amazon', age: 'Hace 42 min', tone: 'amber' },
      { title: 'PlayStation 5 Slim', meta: 'Amazon', age: 'Hace 1 h', tone: 'amber' },
    ],
  },
  dist: {
    title: 'Distribución de ofertas',
    center: '84',
    parts: [
      { label: 'Electrónicos', value: '28', pct: 33, color: '#8b5cf6' },
      { label: 'Moda', value: '18', pct: 21, color: '#a78bfa' },
      { label: 'Hogar', value: '14', pct: 17, color: '#22d3ee' },
      { label: 'Videojuegos', value: '12', pct: 14, color: '#34d399' },
      { label: 'Belleza', value: '7', pct: 8, color: '#fb7185' },
      { label: 'Otros', value: '5', pct: 6, color: '#94a3b8' },
    ],
  },
  recent: {
    title: 'Ofertas recientes moderadas',
    columns: ['Oferta', 'Autor', 'Categoría', 'Estado', 'Moderador', 'Hace'],
    rows: [
      { cells: ['iPhone 15 Pro · 20%', '@techlover', 'Electrónicos', 'Aprobada', 'Carlos Mendoza', '5 min'], tone: 'green' },
      { cells: ['Zapatillas Nike · 40%', '@modafans', 'Moda', 'Aprobada', 'Ana Torres', '12 min'], tone: 'green' },
      { cells: ['Xbox Series X · 15%', '@gamerpro', 'Videojuegos', 'Rechazada', 'Diego Ruiz', '25 min'], tone: 'red' },
      { cells: ['Freidora de aire · 30%', '@hogarplus', 'Hogar', 'Aprobada', 'Sofía García', '35 min'], tone: 'green' },
      { cells: ['Perfume Dior · 25%', '@beautyshop', 'Belleza', 'Pendiente', '—', '42 min'], tone: 'amber' },
    ],
  },
  perf: {
    title: 'Rendimiento del equipo',
    series: [
      { name: 'Aprobadas', color: '#34d399', base: 40, amp: 12 },
      { name: 'Rechazadas', color: '#fb7185', base: 12, amp: 5 },
      { name: 'Pendientes', color: '#fbbf24', base: 10, amp: 4 },
    ],
  },
  alerts: [
    { tone: 'amber', text: '11 ofertas pendientes llevan +6 horas. Revisar para mantener el SLA.', age: 'Ahora' },
    { tone: 'red', text: 'Aumentó 35% los reportes de enlaces rotos. Revisar tiendas con más errores.', age: 'Hace 1 h' },
    { tone: 'amber', text: 'Tiempo promedio subió a 4m 12s. Optimizar proceso de revisión.', age: 'Hace 2 h' },
    { tone: 'green', text: 'Carlos Mendoza tiene el mejor rendimiento: 98% de SLA esta semana.', age: 'Hoy' },
  ],
};

function adapt(base: TeamVista, patch: Partial<TeamVista> & Pick<TeamVista, 'id' | 'title' | 'subtitle' | 'toolHref' | 'toolLabel'>): TeamVista {
  return { ...base, ...patch };
}

export const TEAM_VIEWS: Record<TeamId, TeamVista> = {
  moderacion: moderation,
  finanzas: adapt(moderation, {
    id: 'finanzas',
    title: 'Equipo de finanzas',
    subtitle: 'Pagos, lotes y estado del flujo de dinero.',
    toolHref: '/equipo/contabilidad',
    toolLabel: 'Abrir contabilidad',
    kpis: [
      { label: 'Pagos abiertos', value: '14', sub: 'Pendientes + en revisión', delta: '8%', up: false },
      { label: 'Lotes del mes', value: '3', delta: '1', up: true },
      { label: 'Tiempo promedio de lote', value: '1d 4h', delta: '12%', up: false },
      { label: 'Tasa de éxito', value: '96%', delta: '4%', up: true },
      { label: 'En revisión', value: '6', delta: '2', up: false },
      { label: 'Listos', value: '22', delta: '6%', up: true },
    ],
    activity: { title: 'Movimientos del equipo (últimas 24 horas)', series: [
      { name: 'Listos', color: '#34d399', base: 6, amp: 3 },
      { name: 'En revisión', color: '#fbbf24', base: 3, amp: 2 },
      { name: 'Pendientes', color: '#fb7185', base: 4, amp: 2 },
      { name: 'Congelados', color: '#38bdf8', base: 1, amp: 1 },
    ] },
    status: { title: 'Estado de pagos', center: '42', caption: 'pagos del período', parts: [
      { label: 'Listos', value: '22', pct: 52, color: '#34d399' },
      { label: 'En revisión', value: '6', pct: 14, color: '#fbbf24' },
      { label: 'Pendientes', value: '8', pct: 19, color: '#fb7185' },
      { label: 'Congelados', value: '6', pct: 15, color: '#38bdf8' },
    ] },
    trend: { title: 'Tiempo de un lote', value: '1d 4h', delta: '12% más rápido que el lote anterior', up: false },
    people: { title: 'Lotes recientes', columns: ['Lote', 'Estado', 'Período', 'Pagos', 'Listos', 'Revisión', 'Éxito', 'Nota'], rows: [
      { cells: ['2026-10', 'En revisión', 'Octubre', '14', '8', '6', '96%', 'Al día'], tone: 'amber' },
      { cells: ['2026-09', 'Listo', 'Septiembre', '22', '22', '0', '100%', 'Cerrado'], tone: 'green' },
      { cells: ['2026-08', 'Listo', 'Agosto', '19', '18', '1', '95%', 'Cerrado'], tone: 'green' },
    ] },
    queue: { title: 'Pagos en revisión', count: '6', rows: [
      { title: 'Lote octubre · reserva', meta: 'Pendiente de envío', age: 'Hace 2 h', tone: 'amber' },
      { title: 'Lote octubre · enviado', meta: 'Esperando proveedor', age: 'Hace 5 h', tone: 'amber' },
      { title: 'Ajuste de comisión', meta: 'Revisión manual', age: 'Hace 1 d', tone: 'red' },
    ] },
    dist: { title: 'Pagos por estado', center: '42', parts: [
      { label: 'Listos', value: '22', pct: 52, color: '#34d399' },
      { label: 'Pendientes', value: '8', pct: 19, color: '#fb7185' },
      { label: 'En revisión', value: '6', pct: 14, color: '#fbbf24' },
      { label: 'Congelados', value: '6', pct: 15, color: '#38bdf8' },
    ] },
    recent: { title: 'Movimientos recientes', columns: ['Movimiento', 'Origen', 'Estado', 'Lote', 'Hace', 'Nota'], rows: [
      { cells: ['Reserva de pago', 'Contabilidad', 'Pendiente', '2026-10', '2 h', 'Sin monto en esta vista'], tone: 'amber' },
      { cells: ['Cierre de lote', 'Contabilidad', 'Listo', '2026-09', '4 d', 'Cerrado'], tone: 'green' },
    ] },
    alerts: [
      { tone: 'amber', text: '6 pagos siguen en revisión. El detalle de montos vive en Contabilidad.', age: 'Ahora' },
      { tone: 'green', text: 'El lote de septiembre cerró completo.', age: 'Hace 4 d' },
      { tone: 'red', text: 'Hay un ajuste de comisión esperando revisión manual.', age: 'Hace 1 d' },
    ],
    perf: { title: 'Lotes por semana', series: [
      { name: 'Listos', color: '#34d399', base: 8, amp: 3 },
      { name: 'En revisión', color: '#fbbf24', base: 3, amp: 2 },
    ] },
  }),
  growth: adapt(moderation, {
    id: 'growth',
    title: 'Equipo de growth',
    subtitle: 'Visitas, clics y conversión de la comunidad.',
    toolHref: '/admin/owner/crecimiento',
    toolLabel: 'Abrir crecimiento',
    kpis: [
      { label: 'Visitas a ofertas', value: '12,482', delta: '18%', up: true },
      { label: 'Clicks a tienda', value: '4,821', delta: '12%', up: true },
      { label: 'CTR', value: '38.6%', delta: '6%', up: true },
      { label: 'Conversiones estimadas', value: '312', delta: '9%', up: true },
      { label: 'Nuevos usuarios', value: '86', delta: '14%', up: true },
      { label: 'Campañas activas', value: '4', delta: '1', up: true },
    ],
    activity: { title: 'Tráfico (últimas 24 horas)', series: [
      { name: 'Visitas', color: '#a78bfa', base: 20, amp: 8 },
      { name: 'Clicks', color: '#34d399', base: 10, amp: 4 },
      { name: 'Conversiones', color: '#22d3ee', base: 3, amp: 2 },
    ] },
    status: { title: 'Embudo de hoy', center: '38.6%', caption: 'CTR', parts: [
      { label: 'Visitas', value: '12,482', pct: 55, color: '#a78bfa' },
      { label: 'Clicks', value: '4,821', pct: 33, color: '#34d399' },
      { label: 'Conversiones', value: '312', pct: 12, color: '#22d3ee' },
    ] },
    trend: { title: 'Clicks por hora', value: '4,821', delta: '12% más que ayer', up: true },
    people: { title: 'Campañas', columns: ['Campaña', 'Estado', 'Canal', 'Visitas', 'Clicks', 'CTR', 'Conv.', 'Nota'], rows: [
      { cells: ['Halloween', 'Activa', 'Home', '4,200', '1,640', '39%', '96', 'En curso'], tone: 'green' },
      { cells: ['Electrónicos', 'Activa', 'Feed', '3,100', '1,280', '41%', '88', 'Estable'], tone: 'green' },
      { cells: ['Moda', 'En pausa', 'Plaza', '1,840', '620', '34%', '41', 'Revisar'], tone: 'amber' },
    ] },
    queue: { title: 'Por revisar', count: '3', rows: [
      { title: 'Campaña Moda', meta: 'CTR bajo la media', age: 'Hace 2 h', tone: 'amber' },
      { title: 'Landing Halloween', meta: 'Sin publicar', age: 'Hace 1 d', tone: 'amber' },
      { title: 'AliExpress', meta: 'Tracking intermitente', age: 'Hace 3 h', tone: 'red' },
    ] },
    alerts: [
      { tone: 'green', text: 'EPC de la composición: $1.48, 12% arriba de ayer.', age: 'Hace 1 h' },
      { tone: 'amber', text: 'La campaña de Moda está en pausa.', age: 'Hace 2 h' },
      { tone: 'red', text: 'AliExpress presenta pérdida de clics.', age: 'Hace 3 h' },
    ],
    dist: { title: 'Tráfico por canal', center: '4', parts: [
      { label: 'Home', value: '4,200', pct: 42, color: '#8b5cf6' },
      { label: 'Feed', value: '3,100', pct: 31, color: '#34d399' },
      { label: 'Plaza', value: '1,840', pct: 18, color: '#22d3ee' },
      { label: 'Otros', value: '900', pct: 9, color: '#94a3b8' },
    ] },
    recent: { title: 'Movimientos de campañas', columns: ['Campaña', 'Canal', 'Cambio', 'Estado', 'Hace', 'Nota'], rows: [
      { cells: ['Halloween', 'Home', 'Subió CTR', 'Activa', '1 h', 'En curso'], tone: 'green' },
      { cells: ['Moda', 'Plaza', 'En pausa', 'Pausa', '2 h', 'Revisar'], tone: 'amber' },
      { cells: ['AliExpress', 'Feed', 'Clics bajos', 'Alerta', '3 h', 'Tracking'], tone: 'red' },
    ] },
    perf: { title: 'Visitas y clics', series: [
      { name: 'Visitas', color: '#a78bfa', base: 40, amp: 10 },
      { name: 'Clicks', color: '#34d399', base: 16, amp: 5 },
    ] },
  }),
  producto: adapt(moderation, {
    id: 'producto',
    title: 'Equipo de producto',
    subtitle: 'Salud del producto, errores y tiempos de respuesta.',
    toolHref: '/admin/health',
    toolLabel: 'Abrir salud',
    kpis: [
      { label: 'Uptime', value: '99.98%', delta: '0.01%', up: true },
      { label: 'Errores 5xx', value: '5', delta: '50%', up: false },
      { label: 'Tiempo de respuesta', value: '342 ms', delta: '18%', up: false },
      { label: 'Deploys hoy', value: '3', delta: '1', up: true },
      { label: 'Incidentes abiertos', value: '0', delta: '2', up: false },
      { label: 'Chequeos OK', value: '12/12', delta: '0', up: true },
    ],
    activity: { title: 'Errores por hora', series: [
      { name: '5xx', color: '#fb7185', base: 1, amp: 1 },
      { name: '4xx', color: '#fbbf24', base: 3, amp: 2 },
      { name: 'OK', color: '#34d399', base: 18, amp: 4 },
    ] },
    status: { title: 'Chequeos', center: '12', caption: 'de 12 OK', parts: [
      { label: 'OK', value: '12', pct: 100, color: '#34d399' },
    ] },
    trend: { title: 'Latencia', value: '342 ms', delta: '18% menos que ayer', up: false },
    people: { title: 'Superficies', columns: ['Superficie', 'Estado', 'Latencia', 'Errores', 'Deploys', 'Dueño', 'SLA', 'Nota'], rows: [
      { cells: ['Web', 'Operativa', '280 ms', '1', '2', 'Producto', '99.9%', 'Estable'], tone: 'green' },
      { cells: ['API ofertas', 'Operativa', '310 ms', '2', '1', 'Producto', '99.9%', 'Vigilar'], tone: 'amber' },
      { cells: ['Auth', 'Operativa', '240 ms', '0', '0', 'Producto', '100%', 'Estable'], tone: 'green' },
    ] },
    queue: { title: 'Incidentes', count: '0', rows: [] },
    alerts: [
      { tone: 'green', text: 'Sin incidentes abiertos en esta composición.', age: 'Ahora' },
      { tone: 'amber', text: 'API de ofertas es el endpoint más lento: 310 ms.', age: 'Hace 20 min' },
    ],
    dist: { title: 'Errores por tipo', center: '17', parts: [
      { label: '5xx', value: '5', pct: 29, color: '#fb7185' },
      { label: '4xx', value: '12', pct: 71, color: '#fbbf24' },
    ] },
    recent: { title: 'Deploys recientes', columns: ['Deploy', 'Superficie', 'Estado', 'Hace', 'Dueño', 'Nota'], rows: [
      { cells: ['#1842', 'Web', 'OK', '2 h', 'Producto', 'Estable'], tone: 'green' },
      { cells: ['#1841', 'API', 'OK', '5 h', 'Producto', 'Estable'], tone: 'green' },
      { cells: ['#1840', 'Auth', 'OK', '1 d', 'Producto', 'Estable'], tone: 'green' },
    ] },
    perf: { title: 'Latencia de la semana', series: [
      { name: 'p50', color: '#22d3ee', base: 20, amp: 4 },
      { name: 'p95', color: '#a78bfa', base: 34, amp: 6 },
    ] },
  }),
  hunter: adapt(moderation, {
    id: 'hunter',
    title: 'Equipo Hunter',
    subtitle: 'Captura de ofertas, fuentes y runs.',
    toolHref: '/admin/hunter',
    toolLabel: 'Abrir Hunter',
    kpis: [
      { label: 'Ofertas cazadas', value: '128', delta: '22%', up: true },
      { label: 'Fuentes activas', value: '6 / 8', delta: '0', up: true },
      { label: 'Runs OK', value: '37 / 40', delta: '4%', up: true },
      { label: 'Duplicados', value: '9', delta: '15%', up: false },
      { label: 'Pendientes de revisión', value: '11', delta: '3', up: false },
      { label: 'Tasa de publicación', value: '78%', delta: '6%', up: true },
    ],
    activity: { title: 'Runs (últimas 24 horas)', series: [
      { name: 'OK', color: '#34d399', base: 6, amp: 2 },
      { name: 'Error', color: '#fb7185', base: 1, amp: 1 },
      { name: 'Duplicados', color: '#fbbf24', base: 2, amp: 1 },
    ] },
    status: { title: 'Runs del período', center: '40', caption: 'runs', parts: [
      { label: 'OK', value: '37', pct: 92, color: '#34d399' },
      { label: 'Error', value: '3', pct: 8, color: '#fb7185' },
    ] },
    trend: { title: 'Ofertas por run', value: '128', delta: '22% más que ayer', up: true },
    people: { title: 'Fuentes', columns: ['Fuente', 'Estado', 'Runs', 'OK', 'Error', 'Ofertas', 'Duplicados', 'Nota'], rows: [
      { cells: ['Amazon', 'Activa', '12', '12', '0', '48', '2', 'Estable'], tone: 'green' },
      { cells: ['Mercado Libre', 'Activa', '10', '9', '1', '36', '4', 'Revisar'], tone: 'amber' },
      { cells: ['Liverpool', 'Activa', '8', '8', '0', '22', '1', 'Estable'], tone: 'green' },
      { cells: ['Walmart', 'Pausada', '0', '0', '0', '0', '0', 'Sin actividad'], tone: 'gray' },
    ] },
    queue: { title: 'Runs con error', count: '3', rows: [
      { title: 'Mercado Libre', meta: 'Timeout de catálogo', age: 'Hace 40 min', tone: 'red' },
      { title: 'AliExpress', meta: 'Bloqueo temporal', age: 'Hace 2 h', tone: 'red' },
    ] },
    alerts: [
      { tone: 'green', text: '37 de 40 runs terminaron bien.', age: 'Hoy' },
      { tone: 'red', text: 'Mercado Libre tuvo un timeout en el último run.', age: 'Hace 40 min' },
      { tone: 'amber', text: 'Walmart sigue en pausa.', age: 'Hoy' },
    ],
    dist: { title: 'Ofertas por fuente', center: '128', parts: [
      { label: 'Amazon', value: '48', pct: 38, color: '#8b5cf6' },
      { label: 'Mercado Libre', value: '36', pct: 28, color: '#fbbf24' },
      { label: 'Liverpool', value: '22', pct: 17, color: '#34d399' },
      { label: 'Otras', value: '22', pct: 17, color: '#94a3b8' },
    ] },
    recent: { title: 'Runs recientes', columns: ['Fuente', 'Resultado', 'Ofertas', 'Duplicados', 'Hace', 'Nota'], rows: [
      { cells: ['Amazon', 'OK', '12', '0', '20 min', 'Estable'], tone: 'green' },
      { cells: ['Mercado Libre', 'Error', '0', '0', '40 min', 'Timeout'], tone: 'red' },
      { cells: ['Liverpool', 'OK', '6', '1', '1 h', 'Estable'], tone: 'green' },
    ] },
    perf: { title: 'Runs de la semana', series: [
      { name: 'OK', color: '#34d399', base: 12, amp: 3 },
      { name: 'Error', color: '#fb7185', base: 2, amp: 1 },
    ] },
  }),
  comunidad: adapt(moderation, {
    id: 'comunidad',
    title: 'Equipo de comunidad',
    subtitle: 'Publicaciones, votos, comentarios y reportes.',
    toolHref: '/plaza',
    toolLabel: 'Abrir Plaza',
    kpis: [
      { label: 'Publicaciones', value: '74', delta: '18%', up: true },
      { label: 'Votos', value: '1,284', delta: '12%', up: true },
      { label: 'Comentarios', value: '326', delta: '9%', up: true },
      { label: 'Favoritos', value: '418', delta: '6%', up: true },
      { label: 'Reportes abiertos', value: '23', delta: '4', up: false },
      { label: 'Autores activos', value: '46', delta: '8%', up: true },
    ],
    activity: { title: 'Actividad (últimas 24 horas)', series: [
      { name: 'Votos', color: '#a78bfa', base: 16, amp: 6 },
      { name: 'Comentarios', color: '#22d3ee', base: 6, amp: 3 },
      { name: 'Reportes', color: '#fb7185', base: 2, amp: 1 },
    ] },
    status: { title: 'Mix del día', center: '74', caption: 'publicaciones', parts: [
      { label: 'Votos', value: '1,284', pct: 60, color: '#a78bfa' },
      { label: 'Comentarios', value: '326', pct: 20, color: '#22d3ee' },
      { label: 'Favoritos', value: '418', pct: 20, color: '#fb7185' },
    ] },
    trend: { title: 'Votos por hora', value: '1,284', delta: '12% más que ayer', up: true },
    people: { title: 'Temas activos', columns: ['Tema', 'Estado', 'Mensajes', 'Votos', 'Autores', 'Reportes', 'Hace', 'Nota'], rows: [
      { cells: ['Ofertas del día', 'Activo', '48', '320', '22', '0', '8 min', 'Sano'], tone: 'green' },
      { cells: ['Dudas de cupones', 'Activo', '17', '64', '9', '2', '20 min', 'Revisar'], tone: 'amber' },
      { cells: ['Feedback de la app', 'Activo', '11', '40', '7', '0', '1 h', 'Sano'], tone: 'green' },
    ] },
    queue: { title: 'Reportes sin revisar', count: '23', rows: [
      { title: 'Enlace roto', meta: 'Oferta de electrónicos', age: 'Hace 15 min', tone: 'amber' },
      { title: 'Spam', meta: 'Comentario en Plaza', age: 'Hace 40 min', tone: 'red' },
      { title: 'Oferta falsa', meta: 'Moda', age: 'Hace 1 h', tone: 'red' },
    ] },
    alerts: [
      { tone: 'amber', text: '23 reportes de comunidad siguen abiertos.', age: 'Ahora' },
      { tone: 'green', text: '46 autores publicaron en el período.', age: 'Hoy' },
    ],
    dist: { title: 'Interacciones', center: '74', parts: [
      { label: 'Votos', value: '1,284', pct: 60, color: '#a78bfa' },
      { label: 'Comentarios', value: '326', pct: 20, color: '#22d3ee' },
      { label: 'Favoritos', value: '418', pct: 20, color: '#fb7185' },
    ] },
    recent: { title: 'Actividad reciente', columns: ['Tema', 'Tipo', 'Autor', 'Estado', 'Hace', 'Nota'], rows: [
      { cells: ['Ofertas del día', 'Post', 'Comunidad', 'Activo', '8 min', 'Sano'], tone: 'green' },
      { cells: ['Dudas de cupones', 'Reporte', 'Comunidad', 'Abierto', '20 min', 'Revisar'], tone: 'amber' },
      { cells: ['Feedback de la app', 'Post', 'Comunidad', 'Activo', '1 h', 'Sano'], tone: 'green' },
    ] },
    perf: { title: 'Votos y comentarios', series: [
      { name: 'Votos', color: '#a78bfa', base: 30, amp: 8 },
      { name: 'Comentarios', color: '#22d3ee', base: 10, amp: 4 },
    ] },
  }),
  operaciones: adapt(moderation, {
    id: 'operaciones',
    title: 'Equipo de operaciones',
    subtitle: 'Servicios, colas y procesos que mantienen Aventa en pie.',
    toolHref: '/admin/operaciones',
    toolLabel: 'Abrir operaciones',
    kpis: [
      { label: 'Servicios operativos', value: '7 / 7', delta: '0', up: true },
      { label: 'Cola de escritura', value: '4', delta: '2', up: false },
      { label: 'Fallidos', value: '0', delta: '3', up: false },
      { label: 'Integridad', value: 'OK', delta: '0', up: true },
      { label: 'Correos (hora)', value: '180', delta: '4%', up: true },
      { label: 'Backups', value: 'Al día', delta: '0', up: true },
    ],
    activity: { title: 'Cola (últimas 24 horas)', series: [
      { name: 'Pendientes', color: '#fbbf24', base: 4, amp: 2 },
      { name: 'Procesados', color: '#34d399', base: 14, amp: 4 },
      { name: 'Fallidos', color: '#fb7185', base: 1, amp: 1 },
    ] },
    status: { title: 'Servicios', center: '7', caption: 'operativos', parts: [
      { label: 'Operativos', value: '7', pct: 100, color: '#34d399' },
    ] },
    trend: { title: 'Tiempo de respuesta', value: '342 ms', delta: '18% menos que ayer', up: false },
    people: { title: 'Procesos', columns: ['Proceso', 'Estado', 'Último', 'Pendientes', 'Fallidos', 'Dueño', 'SLA', 'Nota'], rows: [
      { cells: ['Discovery Worker', 'Ejecutándose', '12 min', '2', '0', 'Ops', 'OK', 'Estable'], tone: 'green' },
      { cells: ['Quality Gate', 'Ejecutándose', '8 min', '1', '0', 'Ops', 'OK', 'Estable'], tone: 'green' },
      { cells: ['Backups', 'Ejecutándose', '12 h', '0', '0', 'Ops', 'OK', 'Al día'], tone: 'green' },
      { cells: ['Envío de emails', 'Ejecutándose', '3 h', '1', '0', 'Ops', 'OK', 'Dentro de cuota'], tone: 'green' },
    ] },
    queue: { title: 'Cola de escritura', count: '4', rows: [
      { title: 'Votos diferidos', meta: '4 pendientes', age: 'Hace 2 min', tone: 'amber' },
      { title: 'Eventos de oferta', meta: '0 fallidos', age: 'Hace 6 min', tone: 'green' },
    ] },
    alerts: [
      { tone: 'green', text: 'Los 7 servicios de la composición figuran operativos.', age: 'Ahora' },
      { tone: 'amber', text: 'Quedan 4 escrituras en cola.', age: 'Hace 2 min' },
      { tone: 'green', text: 'El último backup terminó hace 12 h.', age: 'Hoy' },
    ],
    dist: { title: 'Carga por proceso', center: '7', parts: [
      { label: 'Discovery', value: '2', pct: 30, color: '#8b5cf6' },
      { label: 'Quality Gate', value: '1', pct: 20, color: '#34d399' },
      { label: 'Emails', value: '1', pct: 20, color: '#22d3ee' },
      { label: 'Backups', value: '1', pct: 15, color: '#fbbf24' },
      { label: 'Otros', value: '2', pct: 15, color: '#94a3b8' },
    ] },
    recent: { title: 'Eventos recientes', columns: ['Proceso', 'Evento', 'Estado', 'Hace', 'Dueño', 'Nota'], rows: [
      { cells: ['Cola de escritura', '4 pendientes', 'En curso', '2 min', 'Ops', 'Sin fallos'], tone: 'amber' },
      { cells: ['Backups', 'Completado', 'OK', '12 h', 'Ops', 'Al día'], tone: 'green' },
      { cells: ['Integridad', 'Chequeo OK', 'OK', '3 h', 'Ops', 'Sin fallos'], tone: 'green' },
    ] },
    perf: { title: 'Cola de la semana', series: [
      { name: 'Procesados', color: '#34d399', base: 20, amp: 6 },
      { name: 'Pendientes', color: '#fbbf24', base: 4, amp: 2 },
    ] },
  }),
};
