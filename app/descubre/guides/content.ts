import type { LucideIcon } from 'lucide-react';
import {
  Sparkles,
  LayoutGrid,
  ArrowUp,
  Heart,
  UserRound,
  Settings,
  Bell,
  BowArrow,
  PlusCircle,
  Shield,
  Coins,
  TrendingUp,
  Filter,
  Mail,
  Smartphone,
} from 'lucide-react';
import {
  COMMISSION_MIN_UPVOTES_PER_OFFER,
  COMMISSION_REQUIRED_OFFERS,
} from '@/lib/commissions/constants';

export type GuideId = 'aventa' | 'cazador' | 'ahorrador';

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
  steps: GuideStep[];
};

export const GUIDES: GuideMeta[] = [
  {
    id: 'aventa',
    title: 'Guía Aventa',
    tagline: 'Todo lo que puedes hacer',
    description: 'Feed, votos, favoritos, perfil, configuración y más — la guía completa de la plataforma.',
    icon: Sparkles,
    accent: 'from-violet-600 to-fuchsia-600',
    steps: [
      {
        id: 'bienvenida',
        icon: Sparkles,
        title: 'La comunidad que caza por ti',
        subtitle: 'Qué es AVENTA',
        illustration: 'community',
        body: [
          'AVENTA reúne ofertas reales votadas por personas como tú. No es un catálogo estático: la comunidad sube, valida y empuja al ranking lo que vale la pena.',
          'Puedes explorar, votar, guardar, comentar y — si quieres — convertirte en cazador subiendo hallazgos.',
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
          'Los votos alimentan el ranking: lo bueno sube, lo dudoso baja. Ayudas a miles sin escribir un comentario.',
        ],
      },
      {
        id: 'favoritos',
        icon: Heart,
        title: 'Aparta lo que te interesa',
        subtitle: 'Favoritos',
        illustration: 'favorites',
        body: [
          'Toca el corazón en cualquier oferta para guardarla. Ideal cuando aún no compras pero no quieres perder el link.',
          'Revisa todo en Mis favoritos desde tu menú de perfil.',
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
          'En onboarding y Configuración eliges categorías y tiendas. El tab Para ti prioriza ofertas que encajan contigo.',
          'También mejora con tus votos y favoritos: cuanto más usas AVENTA, más fino queda tu feed.',
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
          'Si algo no cuadra — precio falso, enlace roto, spam — repórtalo. Mantienes limpio el ecosistema para todos.',
        ],
      },
      {
        id: 'perfil',
        icon: UserRound,
        title: 'Tu perfil público',
        subtitle: '/u/tu-nombre',
        illustration: 'profile',
        body: [
          'Cada usuario tiene una URL pública para compartir su actividad y ofertas subidas.',
          'Nombre y avatar se editan en Configuración (el nombre visible tiene cooldown de 14 días).',
        ],
        cta: { label: 'Mi espacio', href: '/me' },
      },
      {
        id: 'config',
        icon: Settings,
        title: 'Configuración y categorías',
        subtitle: 'Tu cuenta',
        illustration: 'settings',
        body: [
          'Desde Configuración cambias preferencias de feed, resúmenes por correo, contraseña y datos de perfil.',
          'Las categorías que elijas alimentan el tab Para ti junto con tu comportamiento en la app.',
        ],
        cta: { label: 'Abrir configuración', href: '/settings' },
      },
      {
        id: 'avisos',
        icon: Bell,
        title: 'Notificaciones y PWA',
        subtitle: 'No te pierdas nada',
        illustration: 'notifications',
        body: [
          'La campana agrupa avisos de ofertas y del equipo. Puedes instalar AVENTA como app (PWA) en móvil.',
          'En Android suele aparecer «Instalar app»; en iPhone: Compartir → Añadir a pantalla de inicio.',
        ],
      },
    ],
  },
  {
    id: 'cazador',
    title: 'Guía del Cazador',
    tagline: 'Sube, impacta y gana',
    description: 'Cómo subir ofertas, pasar moderación, sumar reputación y participar en comisiones.',
    icon: BowArrow,
    accent: 'from-violet-600 to-amber-500',
    steps: [
      {
        id: 'quien-es',
        icon: BowArrow,
        title: '¿Qué es un cazador?',
        subtitle: 'El rol',
        illustration: 'hunter-intro',
        body: [
          'Un cazador encuentra precios reales — en tiendas, redes o promos — y los comparte con la comunidad.',
          'Tu oferta ayuda a otros a ahorrar. Si genera impacto (votos, clics, compras), puedes participar en el reparto de comisiones.',
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
          'Completa precio, categoría y — si quieres — descripción, pasos, cupones o MSI. Envía y espera moderación (salvo auto-aprobación).',
        ],
        tips: [
          'Título claro: producto + tienda + beneficio.',
          'Precio real y enlace que funcione.',
          'Buena foto = más votos.',
        ],
        cta: { label: 'Abrir subir oferta', href: '/subir' },
      },
      {
        id: 'moderacion',
        icon: Shield,
        title: 'Moderación y auto-aprobación',
        subtitle: 'Calidad primero',
        illustration: 'moderation',
        body: [
          'Las ofertas nuevas pasan por moderación para evitar spam y precios falsos.',
          'Con reputación alta (nivel ≥ 3) tus ofertas pueden publicarse al instante con vigencia de 7 días. El owner también puede autorizar cazadores de confianza (equipo de subida) con la misma exención.',
        ],
      },
      {
        id: 'comisiones',
        icon: Coins,
        title: 'Programa de comisiones',
        subtitle: 'Impacto real',
        illustration: 'commissions',
        body: [
          `AVENTA monetiza clics afiliados legítimos. Parte se reparte entre cazadores activos que cumplen requisitos: ${COMMISSION_REQUIRED_OFFERS} ofertas aprobadas con al menos ${COMMISSION_MIN_UPVOTES_PER_OFFER} votos positivos cada una.`,
          'Debes aceptar los términos del programa en tu perfil. El reparto es mensual según puntos de calidad acumulados en el periodo.',
        ],
        cta: { label: 'Ver mi perfil y comisiones', href: '/me' },
      },
      {
        id: 'reputacion',
        icon: TrendingUp,
        title: 'Reputación y confianza',
        subtitle: 'Sube de nivel',
        illustration: 'reputation',
        body: [
          'Cada oferta bien recibida suma a tu reputación. Niveles altos desbloquean auto-aprobación, cooldowns más cortos al subir y mayor visibilidad.',
          'Evita duplicados, precios inflados o enlaces rotos: la comunidad vota y eso define tu trayectoria.',
        ],
        cta: { label: 'Mis ofertas', href: '/me' },
      },
      {
        id: 'tips-cazador',
        icon: Sparkles,
        title: 'Tips de cazador pro',
        subtitle: 'Destaca en el feed',
        illustration: 'hunter-tips',
        body: [
          'Sube antes que nadie en promos fuertes (Buen Fin, Hot Sale, Prime Day).',
          'Explica en la descripción por qué es buena oferta: precio histórico, comparativa, cupón extra.',
          'Responde comentarios: una oferta viva genera más confianza y votos.',
        ],
      },
    ],
  },
  {
    id: 'ahorrador',
    title: 'Guía del Ahorrador',
    tagline: 'Encuentra sin complicarte',
    description: 'Para quien solo quiere buenas ofertas: feed, filtros, favoritos y alertas.',
    icon: Heart,
    accent: 'from-emerald-600 to-violet-600',
    steps: [
      {
        id: 'intro',
        icon: Heart,
        title: 'Ahorra sin subir nada',
        subtitle: 'Modo ahorrador',
        illustration: 'saver-intro',
        body: [
          'No necesitas publicar ofertas para sacarle jugo a AVENTA. Explora, vota lo bueno, guarda favoritos y deja que la comunidad haga el trabajo pesado.',
          'Entre más interactúes, mejor se ajusta tu tab Para ti.',
        ],
        cta: { label: 'Ver ofertas', href: '/' },
      },
      {
        id: 'feed-ahorrador',
        icon: LayoutGrid,
        title: 'Elige cómo navegar',
        subtitle: 'Tabs del inicio',
        illustration: 'browse-feed',
        body: [
          'Para ti — lo más relevante para tus gustos.',
          'Top — lo que más respalda la comunidad.',
          'Día a día — básicos y súper.',
          'Recientes — recién publicado, ideal para cazar antes que se acabe.',
        ],
        cta: { label: 'Ir al feed', href: '/' },
      },
      {
        id: 'filtros',
        icon: Filter,
        title: 'Filtra por categoría o tienda',
        subtitle: 'Menos ruido',
        illustration: 'filters',
        body: [
          'Usa los filtros del inicio o entra directo a una categoría (Tecnología, Moda, Gaming…) o tienda (Amazon, Liverpool…).',
          'Configura tus 3 temas favoritos en onboarding o Configuración para afinar Para ti.',
        ],
        cta: { label: 'Tecnología', href: '/categoria/tecnologia' },
      },
      {
        id: 'favoritos-ahorrador',
        icon: Heart,
        title: 'Lista de deseos inteligente',
        subtitle: 'Favoritos',
        illustration: 'saver-favorites',
        body: [
          'Marca ofertas con el corazón y vuelve cuando estés listo para comprar.',
          'Es tu historial personal de oportunidades — sin emails ni hojas de cálculo.',
        ],
        cta: { label: 'Mis favoritos', href: '/me/favorites' },
      },
      {
        id: 'correo',
        icon: Mail,
        title: 'Resúmenes en tu bandeja',
        subtitle: 'Sin abrir la app',
        illustration: 'saver-digest',
        body: [
          'Activa en Configuración el resumen diario (Top 10) o semanal (más comentadas y mejor votadas).',
          'Perfecto si entras poco pero no quieres perderte lo mejor.',
        ],
        cta: { label: 'Activar resúmenes', href: '/settings' },
      },
      {
        id: 'vota-ahorrador',
        icon: ArrowUp,
        title: 'Vota y ayuda gratis',
        subtitle: '1 segundo, mucho impacto',
        illustration: 'saver-vote',
        body: [
          'Aunque no subas ofertas, tu flecha arriba o abajo ordena el feed para todos.',
          'Es la forma más rápida de participar y mantener la calidad de la comunidad.',
        ],
      },
      {
        id: 'pwa-ahorrador',
        icon: Smartphone,
        title: 'Llévala en el bolsillo',
        subtitle: 'App instalada',
        illustration: 'notifications',
        body: [
          'Instala AVENTA en tu pantalla de inicio para abrirla como app nativa.',
          'Combínala con notificaciones y favoritos: ahorras tiempo en cada compra.',
        ],
      },
    ],
  },
];

export function getGuideById(id: string | null | undefined): GuideMeta | undefined {
  return GUIDES.find((g) => g.id === id);
}

export function isGuideId(value: string | null | undefined): value is GuideId {
  return value === 'aventa' || value === 'cazador' || value === 'ahorrador';
}
