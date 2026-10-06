import {
  CATEGORY_ICON,
  type AchievementCategory,
  type AchievementDefinition,
  type AchievementEventType,
  type AchievementRarity,
  type AchievementRule,
  type RevealPolicy,
} from './types';

type Row = {
  code: string;
  name: string;
  description: string;
  unlockLine: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  xpReward: number;
  rule: AchievementRule;
  noun: string;
  hidden?: boolean;
  reveal?: RevealPolicy;
};

/**
 * Catálogo activo de 75 logros.
 * Cada fila nombra una conducta medible. La rareza y el XP siguen el umbral.
 * Un logro de nivel no da XP: la reputación ya es esa progresión.
 * Temporadas: `isActive` se puede apagar sin tocar los logros permanentes.
 * Las fechas no viven aquí; salen de `lib/seasons`.
 */
const ROWS: readonly Row[] = [
  { code: 'first_trail', name: 'Primer rastro', description: 'Publica tu primera oferta aprobada.', unlockLine: 'Aventa ya reconoce tu primer hallazgo.', category: 'caza', rarity: 'common', xpReward: 50, rule: { type: 'approved_offers', target: 1 }, noun: 'ofertas aprobadas' },
  { code: 'hunter_three', name: 'Tres rastros', description: 'Publica 3 ofertas aprobadas.', unlockLine: 'Ya no fue un hallazgo suelto.', category: 'caza', rarity: 'common', xpReward: 40, rule: { type: 'approved_offers', target: 3 }, noun: 'ofertas aprobadas' },
  { code: 'hunter_moving_1', name: 'Cazador en marcha I', description: 'Publica 5 ofertas aprobadas.', unlockLine: 'Ya estás cazando con ritmo.', category: 'caza', rarity: 'common', xpReward: 50, rule: { type: 'approved_offers', target: 5 }, noun: 'ofertas aprobadas' },
  { code: 'hunter_ten', name: 'Diez hallazgos', description: 'Publica 10 ofertas aprobadas.', unlockLine: 'Diez ofertas válidas ya forman una racha de caza.', category: 'caza', rarity: 'uncommon', xpReward: 80, rule: { type: 'approved_offers', target: 10 }, noun: 'ofertas aprobadas' },
  { code: 'hunter_moving_2', name: 'Cazador en marcha II', description: 'Publica 25 ofertas aprobadas.', unlockLine: 'Tu rastro ya se nota en el feed.', category: 'caza', rarity: 'uncommon', xpReward: 100, rule: { type: 'approved_offers', target: 25 }, noun: 'ofertas aprobadas' },
  { code: 'hunter_fifty', name: 'Cincuenta hallazgos', description: 'Publica 50 ofertas aprobadas.', unlockLine: 'Cincuenta ofertas válidas. La caza ya es hábito.', category: 'caza', rarity: 'rare', xpReward: 180, rule: { type: 'approved_offers', target: 50 }, noun: 'ofertas aprobadas' },
  { code: 'hunter_moving_3', name: 'Cazador en marcha III', description: 'Publica 100 ofertas aprobadas.', unlockLine: 'Cien ofertas válidas. Esto ya es oficio.', category: 'caza', rarity: 'rare', xpReward: 250, rule: { type: 'approved_offers', target: 100 }, noun: 'ofertas aprobadas' },
  { code: 'hunter_veteran', name: 'Cazador veterano', description: 'Publica 250 ofertas aprobadas.', unlockLine: 'Llevas un camino largo de ofertas válidas.', category: 'caza', rarity: 'epic', xpReward: 500, rule: { type: 'approved_offers', target: 250 }, noun: 'ofertas aprobadas' },
  { code: 'hunter_five_hundred', name: 'Quinientos hallazgos', description: 'Publica 500 ofertas aprobadas.', unlockLine: 'Quinientas ofertas válidas. El feed ya te conoce.', category: 'caza', rarity: 'epic', xpReward: 320, rule: { type: 'approved_offers', target: 500 }, noun: 'ofertas aprobadas' },
  { code: 'hunter_thousand', name: 'Mil hallazgos', description: 'Publica 1,000 ofertas aprobadas.', unlockLine: 'Mil ofertas válidas. Eso es una carrera.', category: 'caza', rarity: 'legendary', xpReward: 800, rule: { type: 'approved_offers', target: 1000 }, noun: 'ofertas aprobadas' },
  { code: 'offer_spark', name: 'Primer impulso', description: 'Una oferta tuya alcanza 5 votos positivos.', unlockLine: 'Una oferta tuya ya empezó a moverse.', category: 'caza', rarity: 'uncommon', xpReward: 80, rule: { type: 'single_offer_votes', target: 5 }, noun: 'votos en tu mejor oferta' },
  { code: 'first_mark', name: 'Primera huella', description: 'Una oferta alcanza 10 votos.', unlockLine: 'Una de tus ofertas ya dejó huella.', category: 'caza', rarity: 'uncommon', xpReward: 50, rule: { type: 'single_offer_votes', target: 10 }, noun: 'votos en tu mejor oferta' },
  { code: 'growing_impact', name: 'Impacto creciente', description: 'Una oferta alcanza 50 votos.', unlockLine: 'Una oferta tuya está moviendo a la comunidad.', category: 'caza', rarity: 'rare', xpReward: 100, rule: { type: 'single_offer_votes', target: 50 }, noun: 'votos en tu mejor oferta' },
  { code: 'featured_offer', name: 'Oferta destacada', description: 'Una oferta alcanza 100 votos.', unlockLine: 'Una oferta tuya se volvió referencia.', category: 'caza', rarity: 'epic', xpReward: 200, rule: { type: 'single_offer_votes', target: 100 }, noun: 'votos en tu mejor oferta' },
  { code: 'offer_beacon', name: 'Faro', description: 'Una oferta alcanza 250 votos.', unlockLine: 'Una sola oferta tuya se volvió un faro.', category: 'caza', rarity: 'epic', xpReward: 360, rule: { type: 'single_offer_votes', target: 250 }, noun: 'votos en tu mejor oferta' },

  { code: 'clean_first', name: 'Primera limpia', description: 'Publica 1 oferta aprobada sin corrección.', unlockLine: 'Salió bien a la primera.', category: 'calidad', rarity: 'common', xpReward: 40, rule: { type: 'clean_approvals', target: 1 }, noun: 'ofertas aprobadas sin corrección' },
  { code: 'good_eye', name: 'Buen ojo', description: 'Publica 5 ofertas que sean aprobadas sin necesidad de corrección.', unlockLine: 'Tus ofertas salen limpias a la primera.', category: 'calidad', rarity: 'uncommon', xpReward: 50, rule: { type: 'clean_approvals', target: 5 }, noun: 'ofertas aprobadas sin corrección' },
  { code: 'clean_fifteen', name: 'Quince limpias', description: 'Publica 15 ofertas aprobadas sin corrección.', unlockLine: 'La corrección ya es la excepción.', category: 'calidad', rarity: 'uncommon', xpReward: 90, rule: { type: 'clean_approvals', target: 15 }, noun: 'ofertas aprobadas sin corrección' },
  { code: 'clean_forty', name: 'Cuarenta limpias', description: 'Publica 40 ofertas aprobadas sin corrección.', unlockLine: 'Cuarenta ofertas salieron bien a la primera.', category: 'calidad', rarity: 'rare', xpReward: 180, rule: { type: 'clean_approvals', target: 40 }, noun: 'ofertas aprobadas sin corrección' },
  { code: 'clean_hundred', name: 'Cien limpias', description: 'Publica 100 ofertas aprobadas sin corrección.', unlockLine: 'Cien ofertas limpias. Eso es oficio.', category: 'calidad', rarity: 'epic', xpReward: 360, rule: { type: 'clean_approvals', target: 100 }, noun: 'ofertas aprobadas sin corrección' },
  { code: 'clean_two_fifty', name: 'Doscientas cincuenta limpias', description: 'Publica 250 ofertas aprobadas sin corrección.', unlockLine: 'La precisión ya es tu manera de cazar.', category: 'calidad', rarity: 'legendary', xpReward: 700, rule: { type: 'clean_approvals', target: 250 }, noun: 'ofertas aprobadas sin corrección' },
  { code: 'quality_first', name: 'Primera que sí vale', description: 'Publica 1 oferta que supere el umbral de calidad de Aventa.', unlockLine: 'El sistema reconoció una ganga de verdad.', category: 'calidad', rarity: 'uncommon', xpReward: 80, rule: { type: 'quality_offers', target: 1 }, noun: 'ofertas sobre el umbral de calidad' },
  { code: 'bargain_detector', name: 'Detector de gangas', description: 'Publica 10 ofertas que superen el umbral de calidad de Aventa.', unlockLine: 'Encontraste gangas que el sistema sí reconoce.', category: 'calidad', rarity: 'epic', xpReward: 150, rule: { type: 'quality_offers', target: 10 }, noun: 'ofertas sobre el umbral de calidad' },
  { code: 'quality_twenty_five', name: 'Veinticinco que sí valen', description: 'Publica 25 ofertas sobre el umbral de calidad.', unlockLine: 'Ya no es suerte: el umbral se te da seguido.', category: 'calidad', rarity: 'rare', xpReward: 200, rule: { type: 'quality_offers', target: 25 }, noun: 'ofertas sobre el umbral de calidad' },
  { code: 'quality_fifty', name: 'Cincuenta que sí valen', description: 'Publica 50 ofertas sobre el umbral de calidad.', unlockLine: 'Cincuenta gangas reconocidas.', category: 'calidad', rarity: 'epic', xpReward: 340, rule: { type: 'quality_offers', target: 50 }, noun: 'ofertas sobre el umbral de calidad' },
  { code: 'quality_hundred', name: 'Cien que sí valen', description: 'Publica 100 ofertas sobre el umbral de calidad.', unlockLine: 'Cien gangas que el sistema sí respalda.', category: 'calidad', rarity: 'legendary', xpReward: 720, rule: { type: 'quality_offers', target: 100 }, noun: 'ofertas sobre el umbral de calidad' },
  { code: 'rate_ten', name: 'Tasa en marcha', description: 'Alcanza una tasa de aprobación del 70% después de al menos 10 ofertas evaluadas.', unlockLine: 'De cada diez, la mayoría sí entra.', category: 'calidad', rarity: 'uncommon', xpReward: 80, rule: { type: 'approval_rate', minOffers: 10, minRate: 0.7 }, noun: 'ofertas evaluadas' },
  { code: 'precise_hunter', name: 'Cazador preciso', description: 'Alcanza una tasa de aprobación del 80% después de al menos 20 ofertas.', unlockLine: 'La mayoría de lo que publicas sí vale.', category: 'calidad', rarity: 'rare', xpReward: 100, rule: { type: 'approval_rate', minOffers: 20, minRate: 0.8 }, noun: 'ofertas evaluadas' },
  { code: 'eagle_eye', name: 'Ojo de águila', description: 'Demuestra una precisión excepcional al encontrar ofertas.', unlockLine: 'Tu precisión empieza a destacar.', category: 'calidad', rarity: 'rare', xpReward: 250, rule: { type: 'approval_rate', minOffers: 50, minRate: 0.9 }, noun: 'ofertas aprobadas' },
  { code: 'rate_hundred', name: 'Precisión de cien', description: 'Mantén al menos 90% de aprobación después de 100 ofertas evaluadas.', unlockLine: 'Cien evaluaciones y la tasa sigue alta.', category: 'calidad', rarity: 'epic', xpReward: 400, rule: { type: 'approval_rate', minOffers: 100, minRate: 0.9 }, noun: 'ofertas evaluadas' },

  { code: 'first_help', name: 'Primera ayuda', description: 'Tu primera oferta recibe un voto positivo.', unlockLine: 'Alguien encontró útil lo que cazaste.', category: 'comunidad', rarity: 'common', xpReward: 25, rule: { type: 'received_votes', target: 1 }, noun: 'votos positivos recibidos' },
  { code: 'good_contribution', name: 'Buena aportación', description: 'Acumula 25 votos positivos recibidos.', unlockLine: 'La comunidad ya apoyó varias veces tu cacería.', category: 'comunidad', rarity: 'uncommon', xpReward: 75, rule: { type: 'received_votes', target: 25 }, noun: 'votos positivos recibidos' },
  { code: 'community_favorite', name: 'Favorito de la comunidad', description: 'Acumula 100 votos positivos recibidos.', unlockLine: 'Tus ofertas se volvieron un apoyo frecuente.', category: 'comunidad', rarity: 'rare', xpReward: 150, rule: { type: 'received_votes', target: 100 }, noun: 'votos positivos recibidos' },
  { code: 'community_reference', name: 'Referencia de la comunidad', description: 'Acumula 500 votos positivos recibidos.', unlockLine: 'La gente vuelve a lo que tú encuentras.', category: 'comunidad', rarity: 'epic', xpReward: 500, rule: { type: 'received_votes', target: 500 }, noun: 'votos positivos recibidos' },
  { code: 'influential_hunter', name: 'Cazador influyente', description: 'Tus ofertas acumulan 1,000 votos.', unlockLine: 'Mil apoyos salieron de tus hallazgos.', category: 'comunidad', rarity: 'epic', xpReward: 280, rule: { type: 'received_votes', target: 1000 }, noun: 'votos acumulados' },
  { code: 'great_impact', name: 'Gran impacto', description: 'Tus ofertas acumulan 2,500 votos.', unlockLine: 'Miles de apoyos salieron de tus hallazgos.', category: 'comunidad', rarity: 'legendary', xpReward: 400, rule: { type: 'received_votes', target: 2500 }, noun: 'votos acumulados' },
  { code: 'aventa_footprint', name: 'Huella Aventa', description: 'Tus ofertas acumulan 10,000 votos.', unlockLine: 'Dejaste una huella difícil de igualar.', category: 'comunidad', rarity: 'legendary', xpReward: 500, rule: { type: 'received_votes', target: 10000 }, noun: 'votos acumulados' },
  { code: 'comment_like_first', name: 'Primer me gusta', description: 'Recibe 1 me gusta en un comentario tuyo aprobado.', unlockLine: 'Un comentario tuyo le sirvió a alguien más.', category: 'comunidad', rarity: 'common', xpReward: 40, rule: { type: 'comment_likes', target: 1 }, noun: 'me gusta en tus comentarios' },
  { code: 'conversationalist', name: 'Conversador', description: 'Recibe 10 comentarios útiles en tus ofertas.', unlockLine: 'Tus ofertas abrieron conversaciones que ayudaron.', category: 'comunidad', rarity: 'uncommon', xpReward: 75, rule: { type: 'useful_comments', target: 10 }, noun: 'comentarios útiles' },
  { code: 'conversation_first', name: 'Primera conversación', description: 'Deja 1 comentario aprobado en una oferta de otra persona.', unlockLine: 'Entraste a una conversación que no era tuya.', category: 'comunidad', rarity: 'common', xpReward: 40, rule: { type: 'conversations', target: 1 }, noun: 'conversaciones válidas' },
  { code: 'conversation_ten', name: 'Diez conversaciones', description: 'Participa de manera válida en 10 conversaciones.', unlockLine: 'Diez conversaciones reales, no en tus propias ofertas.', category: 'comunidad', rarity: 'uncommon', xpReward: 80, rule: { type: 'conversations', target: 10 }, noun: 'conversaciones válidas' },
  { code: 'participant', name: 'Participante', description: 'Participa de manera válida en 25 conversaciones.', unlockLine: 'Aportaste en conversaciones de verdad.', category: 'comunidad', rarity: 'rare', xpReward: 100, rule: { type: 'conversations', target: 25 }, noun: 'conversaciones válidas' },
  { code: 'vote_first', name: 'Primer voto', description: 'Emite 1 voto positivo en una oferta de otra persona.', unlockLine: 'Apoyaste un hallazgo que no era tuyo.', category: 'comunidad', rarity: 'common', xpReward: 40, rule: { type: 'votes_cast', target: 1 }, noun: 'votos emitidos' },
  { code: 'vote_twenty_five', name: 'Veinticinco votos', description: 'Emite 25 votos positivos en ofertas de otras personas.', unlockLine: 'Ya votas con constancia.', category: 'comunidad', rarity: 'uncommon', xpReward: 80, rule: { type: 'votes_cast', target: 25 }, noun: 'votos emitidos' },
  { code: 'vote_hundred', name: 'Cien votos', description: 'Emite 100 votos positivos en ofertas de otras personas.', unlockLine: 'Cien apoyos dados a la comunidad.', category: 'comunidad', rarity: 'rare', xpReward: 180, rule: { type: 'votes_cast', target: 100 }, noun: 'votos emitidos' },

  { code: 'first_fire', name: 'Primer fuego', description: 'Contribuye en 3 días diferentes.', unlockLine: 'Volviste a aportar, y no solo a entrar.', category: 'progresion', rarity: 'common', xpReward: 25, rule: { type: 'distinct_days', target: 3 }, noun: 'días con contribución' },
  { code: 'constant_hunter', name: 'Cazador constante', description: 'Contribuye durante 7 días diferentes.', unlockLine: 'Siete días de aportación real.', category: 'progresion', rarity: 'uncommon', xpReward: 75, rule: { type: 'distinct_days', target: 7 }, noun: 'días con contribución' },
  { code: 'distinct_month', name: 'Mes presente', description: 'Contribuye en 30 días diferentes.', unlockLine: 'Treinta días en los que sí aportaste.', category: 'progresion', rarity: 'rare', xpReward: 180, rule: { type: 'distinct_days', target: 30 }, noun: 'días con contribución' },
  { code: 'perfect_week', name: 'Semana perfecta', description: 'Contribuye durante 7 días consecutivos.', unlockLine: 'Una semana seguida de contribución real.', category: 'progresion', rarity: 'rare', xpReward: 100, rule: { type: 'consecutive_days', target: 7 }, noun: 'días consecutivos' },
  { code: 'disciplined_hunter', name: 'Cazador disciplinado', description: 'Contribuye durante 14 días consecutivos.', unlockLine: 'Dos semanas sin soltar la contribución.', category: 'progresion', rarity: 'epic', xpReward: 150, rule: { type: 'consecutive_days', target: 14 }, noun: 'días consecutivos' },
  { code: 'unstoppable', name: 'Imparable', description: 'Contribuye durante 30 días consecutivos.', unlockLine: 'Un mes seguido aportando de verdad.', category: 'progresion', rarity: 'epic', xpReward: 300, rule: { type: 'consecutive_days', target: 30 }, noun: 'días consecutivos' },
  { code: 'legend', name: 'Leyenda', description: 'Contribuye durante 90 días consecutivos.', unlockLine: 'Noventa días de contribución. Eso es leyenda.', category: 'progresion', rarity: 'legendary', xpReward: 500, rule: { type: 'consecutive_days', target: 90 }, noun: 'días consecutivos' },
  { code: 'first_step', name: 'Primer paso', description: 'Alcanza Nivel 2.', unlockLine: 'Diste el primer paso de nivel en Aventa.', category: 'progresion', rarity: 'common', xpReward: 0, rule: { type: 'level', target: 2 }, noun: 'nivel' },
  { code: 'contributor', name: 'Contribuidor', description: 'Alcanza Nivel 3.', unlockLine: 'Tu nivel ya habla de contribución.', category: 'progresion', rarity: 'uncommon', xpReward: 0, rule: { type: 'level', target: 3 }, noun: 'nivel' },
  { code: 'hunter_rank', name: 'Cazador', description: 'Alcanza Nivel 4, el máximo de reputación.', unlockLine: 'El nivel de cazador es prestigio, no otro puñado de XP.', category: 'progresion', rarity: 'rare', xpReward: 0, rule: { type: 'level', target: 4 }, noun: 'nivel' },

  { code: 'early_bird', name: 'Madrugador', description: 'Publica una oferta excepcional durante la ventana de la mañana.', unlockLine: 'Encontraste una ganga antes de que despertara el feed.', category: 'exploracion', rarity: 'rare', xpReward: 75, rule: { type: 'dawn' }, noun: 'oferta excepcional de mañana' },
  { code: 'night_hunter', name: 'Cazador nocturno', description: 'Encuentra una oferta excepcional durante la noche.', unlockLine: 'La noche también tuvo una ganga tuya.', category: 'exploracion', rarity: 'rare', xpReward: 75, rule: { type: 'night' }, noun: 'oferta excepcional de noche', hidden: true, reveal: 'until_unlocked' },
  { code: 'flash_hunter', name: 'Flash Hunter', description: 'Encuentra una oferta excepcional con una ventana de disponibilidad muy corta.', unlockLine: 'Cazaste algo que casi no alcanzó a durar.', category: 'exploracion', rarity: 'epic', xpReward: 100, rule: { type: 'flash' }, noun: 'oferta relámpago' },
  { code: 'secret_offer', name: 'Oferta secreta', description: 'Encuentra una oferta excepcional, de las que casi no aparecen.', unlockLine: 'Esto casi no pasa. Y te pasó a ti.', category: 'exploracion', rarity: 'epic', xpReward: 250, rule: { type: 'secret' }, noun: 'oferta secreta', hidden: true, reveal: 'until_unlocked' },
  { code: 'categories_two', name: 'Dos categorías', description: 'Publica ofertas aprobadas en 2 categorías distintas.', unlockLine: 'Tu caza ya salió de una sola categoría.', category: 'exploracion', rarity: 'uncommon', xpReward: 80, rule: { type: 'unique_categories', target: 2 }, noun: 'categorías distintas' },
  { code: 'categories_four', name: 'Cuatro categorías', description: 'Publica ofertas aprobadas en 4 categorías distintas.', unlockLine: 'Cuatro territorios distintos del catálogo.', category: 'exploracion', rarity: 'rare', xpReward: 160, rule: { type: 'unique_categories', target: 4 }, noun: 'categorías distintas' },
  { code: 'categories_six', name: 'Seis categorías', description: 'Publica ofertas aprobadas en 6 categorías distintas.', unlockLine: 'Recorriste casi todo el mapa de categorías.', category: 'exploracion', rarity: 'epic', xpReward: 320, rule: { type: 'unique_categories', target: 6 }, noun: 'categorías distintas' },
  { code: 'stores_three', name: 'Tres tiendas', description: 'Publica ofertas aprobadas de 3 tiendas distintas.', unlockLine: 'La caza ya no depende de una sola tienda.', category: 'exploracion', rarity: 'uncommon', xpReward: 80, rule: { type: 'unique_stores', target: 3 }, noun: 'tiendas distintas' },
  { code: 'stores_ten', name: 'Diez tiendas', description: 'Publica ofertas aprobadas de 10 tiendas distintas.', unlockLine: 'Diez tiendas distintas ya pasaron por tu caza.', category: 'exploracion', rarity: 'rare', xpReward: 180, rule: { type: 'unique_stores', target: 10 }, noun: 'tiendas distintas' },
  { code: 'favorites_ten', name: 'Diez guardadas', description: 'Guarda 10 ofertas en favoritos.', unlockLine: 'Diez hallazgos te importaron lo suficiente para guardarlos.', category: 'exploracion', rarity: 'uncommon', xpReward: 80, rule: { type: 'favorites', target: 10 }, noun: 'ofertas guardadas' },

  { code: 'muertos_1', name: 'Ofrenda', description: 'Publica 1 oferta aprobada durante Día de Muertos.', unlockLine: 'Día de Muertos tuvo un hallazgo tuyo.', category: 'temporadas', rarity: 'common', xpReward: 60, rule: { type: 'season_offers', seasonId: 'dia-de-muertos', target: 1 }, noun: 'ofertas en Día de Muertos' },
  { code: 'muertos_2', name: 'Doble ofrenda', description: 'Publica 2 ofertas aprobadas durante Día de Muertos.', unlockLine: 'Dos hallazgos en la ventana corta de Día de Muertos.', category: 'temporadas', rarity: 'uncommon', xpReward: 120, rule: { type: 'season_offers', seasonId: 'dia-de-muertos', target: 2 }, noun: 'ofertas en Día de Muertos' },
  { code: 'buen_fin_1', name: 'Buen Fin', description: 'Publica 1 oferta aprobada durante Buen Fin.', unlockLine: 'Llegaste al Buen Fin con una oferta válida.', category: 'temporadas', rarity: 'common', xpReward: 60, rule: { type: 'season_offers', seasonId: 'buen-fin', target: 1 }, noun: 'ofertas en Buen Fin' },
  { code: 'buen_fin_3', name: 'Buen Fin en serio', description: 'Publica 3 ofertas aprobadas durante Buen Fin.', unlockLine: 'Tres hallazgos válidos en Buen Fin.', category: 'temporadas', rarity: 'uncommon', xpReward: 120, rule: { type: 'season_offers', seasonId: 'buen-fin', target: 3 }, noun: 'ofertas en Buen Fin' },
  { code: 'buen_fin_8', name: 'Buen Fin a fondo', description: 'Publica 8 ofertas aprobadas durante Buen Fin.', unlockLine: 'Ocho ofertas válidas en la ventana de Buen Fin.', category: 'temporadas', rarity: 'rare', xpReward: 220, rule: { type: 'season_offers', seasonId: 'buen-fin', target: 8 }, noun: 'ofertas en Buen Fin' },
  { code: 'navidad_1', name: 'Primera de Navidad', description: 'Publica 1 oferta aprobada durante Navidad.', unlockLine: 'Navidad tuvo un hallazgo tuyo.', category: 'temporadas', rarity: 'common', xpReward: 60, rule: { type: 'season_offers', seasonId: 'navidad', target: 1 }, noun: 'ofertas en Navidad' },
  { code: 'navidad_5', name: 'Cinco de Navidad', description: 'Publica 5 ofertas aprobadas durante Navidad.', unlockLine: 'Cinco hallazgos válidos en la temporada de Navidad.', category: 'temporadas', rarity: 'uncommon', xpReward: 140, rule: { type: 'season_offers', seasonId: 'navidad', target: 5 }, noun: 'ofertas en Navidad' },
  { code: 'navidad_15', name: 'Navidad completa', description: 'Publica 15 ofertas aprobadas durante Navidad.', unlockLine: 'Quince ofertas válidas a lo largo de Navidad.', category: 'temporadas', rarity: 'rare', xpReward: 260, rule: { type: 'season_offers', seasonId: 'navidad', target: 15 }, noun: 'ofertas en Navidad' },
  { code: 'seasons_two', name: 'Dos temporadas', description: 'Publica al menos una oferta aprobada en 2 temporadas distintas.', unlockLine: 'Tu caza ya cruzó dos temporadas.', category: 'temporadas', rarity: 'rare', xpReward: 200, rule: { type: 'seasons_visited', target: 2 }, noun: 'temporadas con oferta aprobada' },
  { code: 'seasons_three', name: 'Las tres temporadas', description: 'Publica al menos una oferta aprobada en Día de Muertos, Buen Fin y Navidad.', unlockLine: 'Estuviste en las tres temporadas del año.', category: 'temporadas', rarity: 'legendary', xpReward: 640, rule: { type: 'seasons_visited', target: 3 }, noun: 'temporadas con oferta aprobada' },
];

function triggersFor(rule: AchievementRule): readonly AchievementEventType[] {
  switch (rule.type) {
    case 'approved_offers':
    case 'clean_approvals':
    case 'unique_categories':
    case 'unique_stores':
    case 'season_offers':
    case 'seasons_visited':
      return ['OFFER_APPROVED'];
    case 'approval_rate':
      return ['OFFER_APPROVED', 'OFFER_REJECTED'];
    case 'quality_offers':
    case 'dawn':
    case 'night':
    case 'flash':
    case 'secret':
      return ['OFFER_APPROVED', 'QUALITY_THRESHOLD_REACHED'];
    case 'received_votes':
    case 'single_offer_votes':
      return ['OFFER_RECEIVED_VOTE'];
    case 'useful_comments':
      return ['OFFER_RECEIVED_COMMENT'];
    case 'conversations':
    case 'comment_likes':
      return ['USER_COMMENTED'];
    case 'votes_cast':
    case 'favorites':
      return ['USER_VOTED'];
    case 'distinct_days':
    case 'consecutive_days':
      return ['STREAK_DAY_COMPLETED', 'OFFER_APPROVED', 'USER_VOTED', 'USER_COMMENTED'];
    case 'level':
      return ['LEVEL_REACHED'];
    case 'black_friday':
    case 'season':
      return ['OFFER_APPROVED', 'QUALITY_THRESHOLD_REACHED'];
    default: {
      const exhaustive: never = rule;
      return exhaustive;
    }
  }
}

export const ACHIEVEMENT_CATALOG: readonly AchievementDefinition[] = ROWS.map((row, index) => ({
  code: row.code,
  name: row.name,
  description: row.description,
  unlockLine: row.unlockLine,
  icon: CATEGORY_ICON[row.category],
  category: row.category,
  rarity: row.rarity,
  xpReward: row.xpReward,
  isHidden: row.hidden === true,
  reveal: row.reveal ?? 'visible',
  isActive: true,
  isRepeatable: false,
  v1Spotlight: false,
  displayOrder: (index + 1) * 10,
  rule: row.rule,
  triggers: triggersFor(row.rule),
  progressNoun: row.noun,
}));

const byCode = new Map(ACHIEVEMENT_CATALOG.map((item) => [item.code, item]));

export function achievementByCode(code: string): AchievementDefinition | null {
  return byCode.get(code) ?? null;
}

export function activeAchievements(): AchievementDefinition[] {
  return ACHIEVEMENT_CATALOG.filter((item) => item.isActive);
}
