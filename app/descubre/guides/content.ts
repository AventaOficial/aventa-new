import type { LucideIcon } from 'lucide-react';
import {
  Sparkles,
  LayoutGrid,
  ArrowUp,
  Heart,
  UserRound,
  Compass,
  Target,
  PlusCircle,
  Shield,
  Coins,
  TrendingUp,
  Filter,
  Mail,
  Smartphone,
  ShoppingBag,
} from 'lucide-react';
import {
  REWARDS_CREATOR_SHARE_BPS,
  REWARDS_HOLD_DAYS,
  REWARDS_MIN_PAYOUT_CENTS,
  REWARD_STATUSES,
} from '@/lib/rewards/config';
import {
  REWARDS_LEVEL_COUNT,
  REWARDS_VALID_STATUSES,
  rewardsLevelShareBps,
} from '@/lib/rewards/levels';
import { isRewardsPayoutEnabled } from '@/lib/rewards/betaCohort';
import { explainRewardPresentation } from '@/lib/me/rewardStatusCopy';

export type GuideId = 'aventa' | 'cazador' | 'ahorrador' | 'gana';

export type GuideFilter = 'interactive' | 'steps' | 'rewards';

export type GuideTheme = 'violet' | 'orange' | 'teal';

export type IllustrationId =
  | 'community'
  | 'feed-tabs'
  | 'vote'
  | 'favorites'
  | 'personalized'
  | 'comments'
  | 'profile'
  | 'settings'
  | 'notifications'
  | 'hunter-intro'
  | 'upload-flow'
  | 'moderation'
  | 'commissions'
  | 'reputation'
  | 'hunter-tips'
  | 'saver-intro'
  | 'browse-feed'
  | 'filters'
  | 'saver-favorites'
  | 'saver-digest'
  | 'saver-vote';

export type GuideStep = {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  body: string[];
  tips?: string[];
  illustration: IllustrationId;
  cta?: { label: string; href: string };
};

export type GuideMeta = {
  id: GuideId;
  title: string;
  tagline: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  theme: GuideTheme;
  filters: GuideFilter[];
  steps: GuideStep[];
};

function pct(bps: number): string {
  return `${Math.round(bps / 100)}%`;
}

function levelPath(): string {
  return Array.from({ length: REWARDS_LEVEL_COUNT }, (_, index) => pct(rewardsLevelShareBps(index + 1))).join(' → ');
}

function statusMeaning(status: (typeof REWARD_STATUSES)[number]): string {
  const label =
    status === 'PENDING'
      ? 'Pendiente'
      : status === 'VALIDATING'
        ? 'En validación'
        : status === 'AVAILABLE'
          ? 'Disponible'
          : status === 'PAID'
            ? 'Entregada'
            : status === 'CANCELLED'
              ? 'Cancelada'
              : 'Revertida';
  const uiStatus =
    status === 'AVAILABLE' ? 'available' : status === 'PAID' ? 'delivered' : status === 'CANCELLED' ? 'cancelled' : 'validating';
  return explainRewardPresentation({ status, statusLabel: label, uiStatus }).meaning;
}

const welcomeShare = pct(REWARDS_CREATOR_SHARE_BPS);
const maxShare = pct(rewardsLevelShareBps(REWARDS_LEVEL_COUNT));
const minPayout = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(
  REWARDS_MIN_PAYOUT_CENTS / 100,
);
const payoutLine = isRewardsPayoutEnabled()
  ? 'El pago del programa está abierto solo para quien ya cumple las reglas de cobro.'
  : 'Hoy no se puede cobrar. El pago del programa está apagado, aunque una recompensa llegue a disponible.';

export const GUIDES: GuideMeta[] = [
  {
    id: 'aventa',
    title: 'Conoce Aventa',
    tagline: 'Empieza aquí',
    description: 'El feed, los votos, los favoritos y tu perfil.',
    icon: Compass,
    accent: 'from-violet-600 to-fuchsia-600',
    theme: 'violet',
    filters: ['interactive', 'steps'],
    steps: [
      {
        id: 'bienvenida',
        icon: Sparkles,
        title: 'La comunidad que caza por ti',
        subtitle: 'Qué es AVENTA',
        illustration: 'community',
        body: [
          'AVENTA reúne ofertas reales votadas por personas como tú. No es un catálogo estático: la comunidad sube, valida y empuja al ranking lo que vale la pena.',
          'Puedes explorar, votar, guardar, comentar y, si quieres, publicar hallazgos como cazador.',
        ],
        cta: { label: 'Ir al inicio', href: '/' },
      },
      {
        id: 'feed',
        icon: LayoutGrid,
        title: 'Cuatro formas de ver ofertas',
        subtitle: 'Inicio y ranking',
        illustration: 'feed-tabs',
        body: [
          'Día a día — lo esencial del hogar, súper y básicos del día.',
          'Top — lo mejor votado por la comunidad.',
          'Para ti — priorizado según tus categorías, tiendas y actividad.',
          'Recientes — lo más reciente, sin filtros de ranking.',
        ],
        cta: { label: 'Explorar el feed', href: '/' },
      },
      {
        id: 'votar',
        icon: ArrowUp,
        title: 'Tu voto mueve el ranking',
        subtitle: 'Flecha arriba o abajo',
        illustration: 'vote',
        body: [
          'Flecha arriba si el precio y la oferta son buenos. Flecha abajo si crees que puede mejorar o no convence.',
          'Los votos alimentan el ranking: lo bueno sube, lo dudoso baja.',
        ],
      },
      {
        id: 'favoritos',
        icon: Heart,
        title: 'Aparta lo que te interesa',
        subtitle: 'Favoritos',
        illustration: 'favorites',
        body: [
          'Toca el corazón en cualquier oferta para guardarla. Sirve cuando aún no compras y no quieres perder el enlace.',
          'Revisa todo en Favoritos.',
        ],
        cta: { label: 'Ver favoritos', href: '/me/favorites' },
      },
      {
        id: 'para-ti',
        icon: Sparkles,
        title: 'Para ti aprende de ti',
        subtitle: 'Personalización',
        illustration: 'personalized',
        body: [
          'En Configuración eliges categorías. El tab Para ti prioriza ofertas que encajan con esa elección.',
          'También mejora con tus votos y favoritos.',
        ],
        cta: { label: 'Ajustar preferencias', href: '/settings' },
      },
      {
        id: 'comentarios',
        icon: UserRound,
        title: 'Comenta y reporta',
        subtitle: 'Comunidad y calidad',
        illustration: 'comments',
        body: [
          'Dentro de cada oferta puedes comentar dudas, tips o experiencias. Los comentarios pasan por moderación.',
          'Si algo no cuadra — precio falso, enlace roto, spam — repórtalo.',
        ],
      },
      {
        id: 'perfil',
        icon: UserRound,
        title: 'Tu perfil',
        subtitle: 'Identidad en Aventa',
        illustration: 'profile',
        body: [
          'Tu perfil muestra el nombre, el usuario, el Nivel Aventa y, si los configuras, la bio, la portada y la ubicación.',
          'Lo que dejes vacío no se muestra. La actividad y la ciudad solo se publican si tú lo activas en Configuración.',
        ],
        cta: { label: 'Mi espacio', href: '/me' },
      },
    ],
  },
  {
    id: 'cazador',
    title: 'Conviértete en Cazador',
    tagline: 'Sube e impacta',
    description: 'Cómo publicar un hallazgo, pasar moderación y subir de nivel.',
    icon: Target,
    accent: 'from-orange-500 to-amber-500',
    theme: 'orange',
    filters: ['interactive', 'steps'],
    steps: [
      {
        id: 'quien-es',
        icon: Target,
        title: '¿Qué es un cazador?',
        subtitle: 'El rol',
        illustration: 'hunter-intro',
        body: [
          'Un cazador encuentra precios reales — en tiendas, redes o promos — y los comparte con la comunidad.',
          'Publicar no activa Rewards. Esa explicación está en Gana con Aventa, y no aplica a todas las cuentas.',
        ],
        cta: { label: 'Subir mi primera oferta', href: '/subir' },
      },
      {
        id: 'subir',
        icon: PlusCircle,
        title: 'Subir una oferta',
        subtitle: 'Paso a paso',
        illustration: 'upload-flow',
        body: [
          'Pulsa + en la barra inferior (móvil) o lateral (escritorio). Pega el enlace de la tienda: intentamos rellenar título, imagen y tienda.',
          'Completa precio, categoría y, si quieres, descripción, pasos, cupones o MSI. Envía y espera moderación: la oferta queda en revisión hasta que el equipo la apruebe.',
        ],
        tips: ['Título claro: producto + tienda + beneficio.', 'Precio real y enlace que funcione.', 'Buena foto = más votos.'],
        cta: { label: 'Abrir subir oferta', href: '/subir' },
      },
      {
        id: 'moderacion',
        icon: Shield,
        title: 'Moderación',
        subtitle: 'Calidad primero',
        illustration: 'moderation',
        body: [
          'Las ofertas nuevas pasan por moderación para evitar spam y precios falsos.',
          'El Nivel Aventa no publica ofertas por ti. Siempre pasan por moderación antes de salir al feed. Eso es reputación, no una recompensa.',
        ],
      },
      {
        id: 'reputacion',
        icon: TrendingUp,
        title: 'Nivel Aventa',
        subtitle: 'Reputación, no dinero',
        illustration: 'reputation',
        body: [
          'El Nivel Aventa sube con ofertas y comentarios aprobados y con likes en tus comentarios. Baja con rechazos. Desde el nivel 2 tus comentarios se publican sin revisión. Tu voto pesa más a mayor nivel.',
          'No es Rewards y no es el XP de los logros. La reputación no genera dinero.',
        ],
        cta: { label: 'Ver mi nivel', href: '/me/nivel' },
      },
      {
        id: 'tips-cazador',
        icon: Sparkles,
        title: 'Tips de cazador',
        subtitle: 'Destaca en el feed',
        illustration: 'hunter-tips',
        body: [
          'Sube pronto cuando hay una promo fuerte.',
          'Explica por qué es buena oferta: precio, comparativa o cupón.',
          'Responde comentarios: una oferta viva genera más confianza y votos.',
        ],
      },
    ],
  },
  {
    id: 'ahorrador',
    title: 'Aprende a ahorrar',
    tagline: 'Encuentra sin complicarte',
    description: 'Filtros, correo y la app en tu pantalla.',
    icon: ShoppingBag,
    accent: 'from-teal-500 to-emerald-500',
    theme: 'teal',
    filters: ['interactive', 'steps'],
    steps: [
      {
        id: 'intro-ahorrador',
        icon: ShoppingBag,
        title: 'Ahorrar en Aventa',
        subtitle: 'Sin perseguir cada tienda',
        illustration: 'saver-intro',
        body: [
          'El feed ya ordena hallazgos de la comunidad. Tu trabajo es filtrar lo que te importa y guardar lo que vas a revisar.',
          'Votar, favoritos y las pestañas del inicio se explican en Conoce Aventa.',
        ],
        cta: { label: 'Ir al inicio', href: '/' },
      },
      {
        id: 'filtros',
        icon: Filter,
        title: 'Filtra antes de abrir',
        subtitle: 'Tienda, búsqueda y Día a día',
        illustration: 'filters',
        body: [
          'Busca por producto y, en escritorio, filtra por tienda. Día a día concentra hogar, súper y básicos.',
          'Si una oferta no convence, sigue. El ranking no se compra.',
        ],
      },
      {
        id: 'correo',
        icon: Mail,
        title: 'Resúmenes por correo',
        subtitle: 'Diario y semanal',
        illustration: 'saver-digest',
        body: [
          'En Configuración puedes activar el resumen diario y el resumen semanal. Son los dos avisos de correo que existen hoy.',
          'No hay alertas separadas por oferta destacada, por categoría o por comentarios.',
        ],
        cta: { label: 'Abrir configuración', href: '/settings' },
      },
      {
        id: 'pwa-ahorrador',
        icon: Smartphone,
        title: 'Aventa en tu pantalla',
        subtitle: 'Instalar la app',
        illustration: 'notifications',
        body: [
          'En el celular puedes añadir Aventa a la pantalla de inicio.',
          'En Android suele aparecer Instalar. En iPhone: Compartir → Añadir a pantalla de inicio.',
        ],
      },
    ],
  },
  {
    id: 'gana',
    title: 'Gana con Aventa',
    tagline: 'Rewards, con claridad',
    description: 'Qué es una recompensa, quién puede tenerla y qué no promete.',
    icon: Coins,
    accent: 'from-violet-600 to-fuchsia-600',
    theme: 'violet',
    filters: ['rewards', 'steps'],
    steps: [
      {
        id: 'que-es-rewards',
        icon: Coins,
        title: 'Qué es Rewards',
        subtitle: 'No está abierto para todos',
        illustration: 'commissions',
        body: [
          'Rewards es un programa de participación sobre comisiones de afiliado de Aventa. No es tu Nivel Aventa y no son los logros.',
          'No está disponible para todas las cuentas. Solo participa quien recibe invitación y queda inscrito. Una cuenta sin esa inscripción no tiene Rewards activo.',
          'Hoy el programa económico sigue pausado: no se acumula ni se paga una recompensa real. Esta guía no promete dinero ni un pago.',
        ],
        cta: { label: 'Ver mi Rewards', href: '/me/recompensas' },
      },
      {
        id: 'que-es-recompensa',
        icon: Coins,
        title: 'Qué significa una recompensa',
        subtitle: 'Una parte de una comisión elegible',
        illustration: 'commissions',
        body: [
          `Una recompensa es la parte del creador sobre una comisión real, confirmada y atribuible. El máximo de esa parte es ${maxShare}.`,
          'Publicar, votar o comprar cualquier cosa no crea una recompensa. No todas las ofertas generan una.',
        ],
      },
      {
        id: 'bienvenida-rewards',
        icon: Sparkles,
        title: 'Oferta de Bienvenida',
        subtitle: `${welcomeShare} de la comisión atribuida`,
        illustration: 'commissions',
        body: [
          'Cuando tu cuenta queda inscrita, eliges una oferta elegible. Esa oferta elegida es tu Oferta de Bienvenida.',
          `Su reward share es ${welcomeShare} de la comisión afiliada atribuida. El porcentaje se aplica sobre esa comisión, no sobre el precio del producto.`,
          'Elegirla no abre el programa a quien no está inscrito. La recompensa sigue sujeta a validación y a una atribución real.',
        ],
      },
      {
        id: 'niveles',
        icon: TrendingUp,
        title: 'Niveles de Rewards',
        subtitle: `Hasta ${maxShare}`,
        illustration: 'reputation',
        body: [
          `Las ofertas posteriores usan tu nivel de recompensa. Cada recompensa válida sube un nivel: ${levelPath()}.`,
          `La progresión va de ${pct(rewardsLevelShareBps(1))} a ${maxShare}, siempre sobre la comisión afiliada atribuida y no sobre el precio del producto. Cancelada y revertida no suben de nivel. Estos niveles no mueven el Nivel Aventa.`,
        ],
      },
      {
        id: 'cuando-aparece',
        icon: Coins,
        title: 'Cuándo aparece',
        subtitle: 'Comisión elegible',
        illustration: 'commissions',
        body: [
          'Aparece cuando hay una comisión real, confirmada y atribuible a una oferta elegible. En Mercado Libre puede hacer falta revisión manual.',
          'Un clic, una visita o una compra que Aventa no puede atribuir no generan recompensa.',
        ],
      },
      {
        id: 'estados',
        icon: Shield,
        title: 'Estados',
        subtitle: REWARD_STATUSES.join(' · '),
        illustration: 'moderation',
        body: REWARD_STATUSES.map((status) => `${status}. ${statusMeaning(status)}`),
      },
      {
        id: 'cancelacion',
        icon: Shield,
        title: 'Cancelada o revertida',
        subtitle: 'Deja de contar',
        illustration: 'moderation',
        body: [
          `Aventa puede pasar a CANCELLED una recompensa que sigue en ${['PENDING', 'VALIDATING', 'AVAILABLE'].join(', ')}. REVERSED es otro estado.`,
          `Ninguno de los dos está en las que cuentan para el nivel (${REWARDS_VALID_STATUSES.join(', ')}). Por eso dejan de sumar.`,
        ],
      },
      {
        id: 'cobro',
        icon: Coins,
        title: 'Compra elegible y cobro',
        subtitle: 'La regla existe; el pago no está abierto',
        illustration: 'commissions',
        body: [
          `Una compra elegible es la que produce una comisión atribuible y confirmada, no cualquier compra hecha desde Aventa. Antes de AVAILABLE hay ${REWARDS_HOLD_DAYS} días de validación.`,
          `La regla de monto mínimo es ${minPayout}. ${payoutLine}`,
          'Si algún día un pago real se abre, Aventa puede pedir datos de pago y fiscales para identificar a la persona y el depósito. Esta guía no los pide y el pago sigue apagado.',
        ],
      },
      {
        id: 'tres-cosas',
        icon: UserRound,
        title: 'Nivel, logros y Rewards',
        subtitle: 'Tres sistemas distintos',
        illustration: 'profile',
        body: [
          'Nivel Aventa es reputación: puntos por ofertas, comentarios y likes. Sirve para confianza y peso del voto.',
          'Los logros son reconocimientos que puedes destacar en el perfil, hasta cinco.',
          'Rewards es la parte de una comisión elegible, solo si tu cuenta está inscrita. Ninguno de los tres garantiza un pago.',
        ],
      },
      {
        id: 'sin-rewards',
        icon: UserRound,
        title: 'Si tu cuenta no participa',
        subtitle: 'Rewards no está activo',
        illustration: 'profile',
        body: [
          'Si no tienes invitación o no quedaste inscrito, Rewards no está activo en tu cuenta. No verás porcentajes ni podrás cobrar.',
          'Puedes seguir publicando, votando y usando el Nivel Aventa. Eso no desbloquea Rewards por sí solo.',
        ],
        cta: { label: 'Revisar mi cuenta', href: '/me/recompensas' },
      },
    ],
  },
];

export function isGuideId(value: string | null | undefined): value is GuideId {
  return GUIDES.some((guide) => guide.id === value);
}

export function getGuideById(id: GuideId): GuideMeta | undefined {
  return GUIDES.find((guide) => guide.id === id);
}
