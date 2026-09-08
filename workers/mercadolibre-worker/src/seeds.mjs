/**
 * Registro de superficies de descubrimiento del worker de Mercado Libre.
 *
 * Vive en el repo, no en el YAML del workflow, para que agregar una superficie
 * no obligue a tocar el motor ni a editar la definición del cron.
 *
 * Cada entrada:
 *   id       identidad estable; con ella se agrupan las métricas por seed.
 *   url      superficie a visitar. Solo páginas públicas de ofertas de ML.
 *   group    'general' | 'lightning' | 'category'
 *   category id de categoría de ML cuando aplica, o null. Es la identidad real
 *            de la superficie: no se le inventa una etiqueta humana que no
 *            podemos verificar sin llamar a la API de ML.
 *   enabled  false deja la seed fuera de la rotación sin borrarla.
 */
export const ML_SEED_REGISTRY = [
  {
    id: 'ofertas_hub',
    url: 'https://www.mercadolibre.com.mx/ofertas',
    group: 'general',
    category: null,
    enabled: true,
  },
  {
    id: 'ofertas_hub_p2',
    url: 'https://www.mercadolibre.com.mx/ofertas?page=2',
    group: 'general',
    category: null,
    enabled: true,
  },
  {
    id: 'ofertas_hub_p3',
    url: 'https://www.mercadolibre.com.mx/ofertas?page=3',
    group: 'general',
    category: null,
    enabled: true,
  },
  {
    id: 'lightning',
    url: 'https://www.mercadolibre.com.mx/ofertas?container_id=MLM779363-1&promotion_type=lightning',
    group: 'lightning',
    category: null,
    enabled: true,
  },
  {
    id: 'deal_MLM779363',
    url: 'https://www.mercadolibre.com.mx/ofertas?deal_ids=MLM779363-1',
    group: 'lightning',
    category: null,
    enabled: true,
  },
  {
    id: 'cat_MLM1000',
    url: 'https://www.mercadolibre.com.mx/ofertas?category=MLM1000',
    group: 'category',
    category: 'MLM1000',
    enabled: true,
  },
  {
    id: 'cat_MLM1648',
    url: 'https://www.mercadolibre.com.mx/ofertas?category=MLM1648',
    group: 'category',
    category: 'MLM1648',
    enabled: true,
  },
  {
    id: 'cat_MLM1574',
    url: 'https://www.mercadolibre.com.mx/ofertas?category=MLM1574',
    group: 'category',
    category: 'MLM1574',
    enabled: true,
  },
  {
    id: 'cat_MLM1144',
    url: 'https://www.mercadolibre.com.mx/ofertas?category=MLM1144',
    group: 'category',
    category: 'MLM1144',
    enabled: true,
  },
  {
    id: 'cat_MLM1246',
    url: 'https://www.mercadolibre.com.mx/ofertas?category=MLM1246',
    group: 'category',
    category: 'MLM1246',
    enabled: true,
  },
  {
    id: 'cat_MLM1430',
    url: 'https://www.mercadolibre.com.mx/ofertas?category=MLM1430',
    group: 'category',
    category: 'MLM1430',
    enabled: true,
  },
  {
    id: 'cat_MLM1276',
    url: 'https://www.mercadolibre.com.mx/ofertas?category=MLM1276',
    group: 'category',
    category: 'MLM1276',
    enabled: true,
  },
  {
    id: 'cat_MLM1747',
    url: 'https://www.mercadolibre.com.mx/ofertas?category=MLM1747',
    group: 'category',
    category: 'MLM1747',
    enabled: true,
  },
  {
    id: 'cat_MLM1168',
    url: 'https://www.mercadolibre.com.mx/ofertas?category=MLM1168',
    group: 'category',
    category: 'MLM1168',
    enabled: true,
  },
];

/** Ventana de rotación por defecto: un índice nuevo cada 30 min. */
export const SEED_ROTATION_INTERVAL_MS = 30 * 60 * 1000;

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/**
 * Paso de rotación coprimo con el total de seeds.
 *
 * Rotar de uno en uno haría que dos ciclos seguidos compartieran casi todas las
 * seeds, que es justo el problema que estamos resolviendo. Un paso coprimo
 * cercano a la mitad separa ciclos consecutivos y aun así recorre el registro
 * completo antes de repetir.
 */
export function coprimeStride(total) {
  if (total <= 2) return 1;
  const start = Math.floor(total / 2);
  for (let candidate = start; candidate < total; candidate++) {
    if (gcd(candidate, total) === 1) return candidate;
  }
  return 1;
}

/**
 * Índice de ciclo derivado del reloj. Sin estado persistido y estable entre
 * runners: dos procesos del mismo ciclo calculan el mismo índice.
 */
export function cycleIndexFor(now = Date.now(), intervalMs = SEED_ROTATION_INTERVAL_MS) {
  const ms = now instanceof Date ? now.getTime() : Number(now);
  const step = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : SEED_ROTATION_INTERVAL_MS;
  if (!Number.isFinite(ms)) return 0;
  return Math.floor(ms / step);
}

/**
 * Rota el orden de las seeds de forma determinista. Mismo índice, mismo orden:
 * reproducible y testeable, sin `Math.random`.
 */
export function rotateSeeds(seeds, cycleIndex) {
  const list = Array.isArray(seeds) ? seeds.filter(Boolean) : [];
  const total = list.length;
  if (total <= 1) return [...list];
  const index = Number.isFinite(cycleIndex) ? Math.trunc(cycleIndex) : 0;
  const offset = (((index * coprimeStride(total)) % total) + total) % total;
  return [...list.slice(offset), ...list.slice(0, offset)];
}

/**
 * Seeds activas para este ciclo, ya rotadas.
 *
 * `override` (WORKER_ML_SEEDS) sigue funcionando como escape manual: si viene
 * con contenido gana sobre el registro. Se rota igual, para que un override
 * largo no se quede siempre en sus primeras entradas.
 */
export function resolveSeeds({ override = [], cycleIndex = 0 } = {}) {
  const fromOverride = (Array.isArray(override) ? override : [])
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .map((url, i) => ({ id: `override_${i + 1}`, url, group: 'override', category: null }));

  const base =
    fromOverride.length > 0
      ? fromOverride
      : ML_SEED_REGISTRY.filter((seed) => seed.enabled !== false).map(
          ({ id, url, group, category }) => ({ id, url, group, category })
        );

  return rotateSeeds(base, cycleIndex);
}
