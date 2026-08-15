import type { CardOffer } from '@/lib/offers/transform';

export type HomeTab = 'vitales' | 'top' | 'personalized' | 'latest';

export type TesterOffer = CardOffer & { tabs: HomeTab[] };

const IMG: Record<string, string> = {
  'tester-1': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=iPhone+16+Pro',
  'tester-2': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=PC+Gamer',
  'tester-3': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Nike+Air+Max',
  'tester-4': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Lavasecadora',
  'tester-5': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Sartenes',
  'tester-6': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=MacBook+Air',
  'tester-7': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Audifonos+Sony',
  'tester-8': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Silla+Gamer',
  'tester-9': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=TV+Samsung',
  'tester-10': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Cafetera',
  'tester-11': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Mochila',
  'tester-12': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Tablet+Galaxy',
  'tester-13': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Aspiradora',
  'tester-14': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Reloj+Smart',
  'tester-15': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Bici+Electrica',
  'tester-16': 'https://placehold.co/400x300/e8e8ed/1d1d1f?text=Air+Fryer',
};

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function tester(
  id: string,
  title: string,
  brand: string,
  originalPrice: number,
  discountPrice: number,
  upvotes: number,
  downvotes: number,
  tabs: HomeTab[],
  createdAt: string,
  description: string,
): TesterOffer {
  const discount =
    originalPrice > 0 ? Math.round((1 - discountPrice / originalPrice) * 100) : 0;
  return {
    id,
    title,
    brand,
    originalPrice,
    discountPrice,
    discount,
    description,
    upvotes,
    downvotes,
    offerUrl: '',
    image: IMG[id],
    votes: { up: upvotes, down: downvotes, score: upvotes * 2 - downvotes },
    author: { username: 'Tester' },
    ranking_momentum: 0,
    createdAt,
    tabs,
  };
}

/**
 * Ofertas de ejemplo para rellenar el home cuando el owner activa el flag.
 * Distintas en cada pestaña (Día a día / Top / Para ti / Recientes).
 */
export const MOCK_TESTER_OFFERS: TesterOffer[] = [
  tester('tester-4', 'Lavasecadora Midea 12kg Titanium', 'Mercado Libre', 8999, 6999, 8, 1, ['vitales'], hoursAgo(6), 'Para el día a día en casa.'),
  tester('tester-5', 'Juego 3 Sartenes Deleite Vasconia Negro', 'Mercado Libre', 899, 599, 6, 0, ['vitales'], hoursAgo(8), 'Cocina sin gastar de más.'),
  tester('tester-10', 'Cafetera Nespresso Vertuo Next', 'Amazon', 2499, 1999, 9, 0, ['vitales'], hoursAgo(5), 'Café en casa, precio de oferta.'),
  tester('tester-11', 'Mochila Antirrobo USB Portátil', 'Amazon', 699, 449, 5, 0, ['vitales'], hoursAgo(10), 'Para la ruta de cada mañana.'),

  tester('tester-1', 'iPhone 16 Pro Max 256 GB Liberado', 'Amazon', 32999, 27999, 48, 2, ['top'], hoursAgo(20), 'La más votada de la semana.'),
  tester('tester-2', 'PC Gamer AMD Ryzen 5 5600 RTX 4060 16GB', 'Mercado Libre', 18999, 15999, 36, 1, ['top'], hoursAgo(18), 'Setup gamer con descuento fuerte.'),
  tester('tester-6', 'MacBook Air M3 13" 8GB 256GB', 'Amazon', 24999, 21999, 32, 2, ['top'], hoursAgo(22), 'La notebook que más están cazando.'),
  tester('tester-9', 'Smart TV Samsung 55" 4K Crystal UHD', 'Mercado Libre', 12999, 9999, 28, 2, ['top'], hoursAgo(16), 'Pantalla grande, precio recortado.'),

  tester('tester-3', 'Tenis Nike Air Max 270 Hombre', 'Amazon', 2499, 1799, 12, 0, ['personalized'], hoursAgo(4), 'Porque te gustan las ofertas de moda.'),
  tester('tester-7', 'Audífonos Sony WH-1000XM5', 'Amazon', 6999, 5499, 10, 0, ['personalized'], hoursAgo(7), 'Audio que encaja con lo que sueles guardar.'),
  tester('tester-8', 'Silla Gamer Ergonómica Reclinable', 'Mercado Libre', 4499, 3499, 7, 1, ['personalized'], hoursAgo(9), 'Para tu espacio de trabajo o juego.'),
  tester('tester-12', 'Tablet Galaxy Tab S9 128GB', 'Amazon', 9999, 7999, 11, 1, ['personalized'], hoursAgo(3), 'Sugerida según lo que sueles ver.'),

  tester('tester-13', 'Aspiradora Inalámbrica Dyson V12', 'Amazon', 11999, 9499, 4, 0, ['latest'], hoursAgo(0.2), 'Publicada hace minutos.'),
  tester('tester-14', 'Reloj Inteligente Amazfit GTR 4', 'Mercado Libre', 3999, 2999, 3, 0, ['latest'], hoursAgo(0.5), 'Recién cazada.'),
  tester('tester-15', 'Bicicleta Eléctrica Plegable 250W', 'Mercado Libre', 14999, 11999, 5, 1, ['latest'], hoursAgo(1), 'Acaba de entrar al feed.'),
  tester('tester-16', 'Freidora de aire 5L digital', 'Amazon', 1899, 1299, 2, 0, ['latest'], hoursAgo(1.5), 'La más nueva de hogar.'),
];

export function testersForTab(tab: HomeTab): CardOffer[] {
  return MOCK_TESTER_OFFERS.filter((o) => o.tabs.includes(tab));
}
