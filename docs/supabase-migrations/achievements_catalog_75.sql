-- Catálogo canónico de 75 logros. Fuente: lib/achievements/catalog.ts.
-- Idempotente. No borra user_achievements ni achievement_xp_grants.
-- No toca profiles.achievement_xp, reputación, rewards, payouts ni el firewall de actores.
-- Las reglas y las temporadas viven en el catálogo TypeScript: esta tabla no tiene columna de regla.
-- Filas fuera del catálogo se conservan; solo pasan a is_active = false.
-- experiencia y especiales siguen permitidas para esas filas históricas inactivas.

alter table public.achievements drop constraint if exists achievements_category_check;

insert into public.achievements (
  code, name, description, icon, category, rarity, xp_reward, is_hidden, is_active, is_repeatable, display_order
) values
('first_trail', 'Primer rastro', 'Publica tu primera oferta aprobada.', '🏹', 'caza', 'common', 50, false, true, false, 10),
('hunter_three', 'Tres rastros', 'Publica 3 ofertas aprobadas.', '🏹', 'caza', 'common', 40, false, true, false, 20),
('hunter_moving_1', 'Cazador en marcha I', 'Publica 5 ofertas aprobadas.', '🏹', 'caza', 'common', 50, false, true, false, 30),
('hunter_ten', 'Diez hallazgos', 'Publica 10 ofertas aprobadas.', '🏹', 'caza', 'uncommon', 80, false, true, false, 40),
('hunter_moving_2', 'Cazador en marcha II', 'Publica 25 ofertas aprobadas.', '🏹', 'caza', 'uncommon', 100, false, true, false, 50),
('hunter_fifty', 'Cincuenta hallazgos', 'Publica 50 ofertas aprobadas.', '🏹', 'caza', 'rare', 180, false, true, false, 60),
('hunter_moving_3', 'Cazador en marcha III', 'Publica 100 ofertas aprobadas.', '🏹', 'caza', 'rare', 250, false, true, false, 70),
('hunter_veteran', 'Cazador veterano', 'Publica 250 ofertas aprobadas.', '🏹', 'caza', 'epic', 500, false, true, false, 80),
('hunter_five_hundred', 'Quinientos hallazgos', 'Publica 500 ofertas aprobadas.', '🏹', 'caza', 'epic', 320, false, true, false, 90),
('hunter_thousand', 'Mil hallazgos', 'Publica 1,000 ofertas aprobadas.', '🏹', 'caza', 'legendary', 800, false, true, false, 100),
('offer_spark', 'Primer impulso', 'Una oferta tuya alcanza 5 votos positivos.', '🏹', 'caza', 'uncommon', 80, false, true, false, 110),
('first_mark', 'Primera huella', 'Una oferta alcanza 10 votos.', '🏹', 'caza', 'uncommon', 50, false, true, false, 120),
('growing_impact', 'Impacto creciente', 'Una oferta alcanza 50 votos.', '🏹', 'caza', 'rare', 100, false, true, false, 130),
('featured_offer', 'Oferta destacada', 'Una oferta alcanza 100 votos.', '🏹', 'caza', 'epic', 200, false, true, false, 140),
('offer_beacon', 'Faro', 'Una oferta alcanza 250 votos.', '🏹', 'caza', 'epic', 360, false, true, false, 150),
('clean_first', 'Primera limpia', 'Publica 1 oferta aprobada sin corrección.', '🎯', 'calidad', 'common', 40, false, true, false, 160),
('good_eye', 'Buen ojo', 'Publica 5 ofertas que sean aprobadas sin necesidad de corrección.', '🎯', 'calidad', 'uncommon', 50, false, true, false, 170),
('clean_fifteen', 'Quince limpias', 'Publica 15 ofertas aprobadas sin corrección.', '🎯', 'calidad', 'uncommon', 90, false, true, false, 180),
('clean_forty', 'Cuarenta limpias', 'Publica 40 ofertas aprobadas sin corrección.', '🎯', 'calidad', 'rare', 180, false, true, false, 190),
('clean_hundred', 'Cien limpias', 'Publica 100 ofertas aprobadas sin corrección.', '🎯', 'calidad', 'epic', 360, false, true, false, 200),
('clean_two_fifty', 'Doscientas cincuenta limpias', 'Publica 250 ofertas aprobadas sin corrección.', '🎯', 'calidad', 'legendary', 700, false, true, false, 210),
('quality_first', 'Primera que sí vale', 'Publica 1 oferta que supere el umbral de calidad de Aventa.', '🎯', 'calidad', 'uncommon', 80, false, true, false, 220),
('bargain_detector', 'Detector de gangas', 'Publica 10 ofertas que superen el umbral de calidad de Aventa.', '🎯', 'calidad', 'epic', 150, false, true, false, 230),
('quality_twenty_five', 'Veinticinco que sí valen', 'Publica 25 ofertas sobre el umbral de calidad.', '🎯', 'calidad', 'rare', 200, false, true, false, 240),
('quality_fifty', 'Cincuenta que sí valen', 'Publica 50 ofertas sobre el umbral de calidad.', '🎯', 'calidad', 'epic', 340, false, true, false, 250),
('quality_hundred', 'Cien que sí valen', 'Publica 100 ofertas sobre el umbral de calidad.', '🎯', 'calidad', 'legendary', 720, false, true, false, 260),
('rate_ten', 'Tasa en marcha', 'Alcanza una tasa de aprobación del 70% después de al menos 10 ofertas evaluadas.', '🎯', 'calidad', 'uncommon', 80, false, true, false, 270),
('precise_hunter', 'Cazador preciso', 'Alcanza una tasa de aprobación del 80% después de al menos 20 ofertas.', '🎯', 'calidad', 'rare', 100, false, true, false, 280),
('eagle_eye', 'Ojo de águila', 'Demuestra una precisión excepcional al encontrar ofertas.', '🎯', 'calidad', 'rare', 250, false, true, false, 290),
('rate_hundred', 'Precisión de cien', 'Mantén al menos 90% de aprobación después de 100 ofertas evaluadas.', '🎯', 'calidad', 'epic', 400, false, true, false, 300),
('first_help', 'Primera ayuda', 'Tu primera oferta recibe un voto positivo.', '❤️', 'comunidad', 'common', 25, false, true, false, 310),
('good_contribution', 'Buena aportación', 'Acumula 25 votos positivos recibidos.', '❤️', 'comunidad', 'uncommon', 75, false, true, false, 320),
('community_favorite', 'Favorito de la comunidad', 'Acumula 100 votos positivos recibidos.', '❤️', 'comunidad', 'rare', 150, false, true, false, 330),
('community_reference', 'Referencia de la comunidad', 'Acumula 500 votos positivos recibidos.', '❤️', 'comunidad', 'epic', 500, false, true, false, 340),
('influential_hunter', 'Cazador influyente', 'Tus ofertas acumulan 1,000 votos.', '❤️', 'comunidad', 'epic', 280, false, true, false, 350),
('great_impact', 'Gran impacto', 'Tus ofertas acumulan 2,500 votos.', '❤️', 'comunidad', 'legendary', 400, false, true, false, 360),
('aventa_footprint', 'Huella Aventa', 'Tus ofertas acumulan 10,000 votos.', '❤️', 'comunidad', 'legendary', 500, false, true, false, 370),
('comment_like_first', 'Primer me gusta', 'Recibe 1 me gusta en un comentario tuyo aprobado.', '❤️', 'comunidad', 'common', 40, false, true, false, 380),
('conversationalist', 'Conversador', 'Recibe 10 comentarios útiles en tus ofertas.', '❤️', 'comunidad', 'uncommon', 75, false, true, false, 390),
('conversation_first', 'Primera conversación', 'Deja 1 comentario aprobado en una oferta de otra persona.', '❤️', 'comunidad', 'common', 40, false, true, false, 400),
('conversation_ten', 'Diez conversaciones', 'Participa de manera válida en 10 conversaciones.', '❤️', 'comunidad', 'uncommon', 80, false, true, false, 410),
('participant', 'Participante', 'Participa de manera válida en 25 conversaciones.', '❤️', 'comunidad', 'rare', 100, false, true, false, 420),
('vote_first', 'Primer voto', 'Emite 1 voto positivo en una oferta de otra persona.', '❤️', 'comunidad', 'common', 40, false, true, false, 430),
('vote_twenty_five', 'Veinticinco votos', 'Emite 25 votos positivos en ofertas de otras personas.', '❤️', 'comunidad', 'uncommon', 80, false, true, false, 440),
('vote_hundred', 'Cien votos', 'Emite 100 votos positivos en ofertas de otras personas.', '❤️', 'comunidad', 'rare', 180, false, true, false, 450),
('first_fire', 'Primer fuego', 'Contribuye en 3 días diferentes.', '🔥', 'progresion', 'common', 25, false, true, false, 460),
('constant_hunter', 'Cazador constante', 'Contribuye durante 7 días diferentes.', '🔥', 'progresion', 'uncommon', 75, false, true, false, 470),
('distinct_month', 'Mes presente', 'Contribuye en 30 días diferentes.', '🔥', 'progresion', 'rare', 180, false, true, false, 480),
('perfect_week', 'Semana perfecta', 'Contribuye durante 7 días consecutivos.', '🔥', 'progresion', 'rare', 100, false, true, false, 490),
('disciplined_hunter', 'Cazador disciplinado', 'Contribuye durante 14 días consecutivos.', '🔥', 'progresion', 'epic', 150, false, true, false, 500),
('unstoppable', 'Imparable', 'Contribuye durante 30 días consecutivos.', '🔥', 'progresion', 'epic', 300, false, true, false, 510),
('legend', 'Leyenda', 'Contribuye durante 90 días consecutivos.', '🔥', 'progresion', 'legendary', 500, false, true, false, 520),
('first_step', 'Primer paso', 'Alcanza Nivel 2.', '🔥', 'progresion', 'common', 0, false, true, false, 530),
('contributor', 'Contribuidor', 'Alcanza Nivel 3.', '🔥', 'progresion', 'uncommon', 0, false, true, false, 540),
('hunter_rank', 'Cazador', 'Alcanza Nivel 4, el máximo de reputación.', '🔥', 'progresion', 'rare', 0, false, true, false, 550),
('early_bird', 'Madrugador', 'Publica una oferta excepcional durante la ventana de la mañana.', '🧭', 'exploracion', 'rare', 75, false, true, false, 560),
('night_hunter', 'Cazador nocturno', 'Encuentra una oferta excepcional durante la noche.', '🧭', 'exploracion', 'rare', 75, true, true, false, 570),
('flash_hunter', 'Flash Hunter', 'Encuentra una oferta excepcional con una ventana de disponibilidad muy corta.', '🧭', 'exploracion', 'epic', 100, false, true, false, 580),
('secret_offer', 'Oferta secreta', 'Encuentra una oferta excepcional, de las que casi no aparecen.', '🧭', 'exploracion', 'epic', 250, true, true, false, 590),
('categories_two', 'Dos categorías', 'Publica ofertas aprobadas en 2 categorías distintas.', '🧭', 'exploracion', 'uncommon', 80, false, true, false, 600),
('categories_four', 'Cuatro categorías', 'Publica ofertas aprobadas en 4 categorías distintas.', '🧭', 'exploracion', 'rare', 160, false, true, false, 610),
('categories_six', 'Seis categorías', 'Publica ofertas aprobadas en 6 categorías distintas.', '🧭', 'exploracion', 'epic', 320, false, true, false, 620),
('stores_three', 'Tres tiendas', 'Publica ofertas aprobadas de 3 tiendas distintas.', '🧭', 'exploracion', 'uncommon', 80, false, true, false, 630),
('stores_ten', 'Diez tiendas', 'Publica ofertas aprobadas de 10 tiendas distintas.', '🧭', 'exploracion', 'rare', 180, false, true, false, 640),
('favorites_ten', 'Diez guardadas', 'Guarda 10 ofertas en favoritos.', '🧭', 'exploracion', 'uncommon', 80, false, true, false, 650),
('muertos_1', 'Ofrenda', 'Publica 1 oferta aprobada durante Día de Muertos.', '🎉', 'temporadas', 'common', 60, false, true, false, 660),
('muertos_2', 'Doble ofrenda', 'Publica 2 ofertas aprobadas durante Día de Muertos.', '🎉', 'temporadas', 'uncommon', 120, false, true, false, 670),
('buen_fin_1', 'Buen Fin', 'Publica 1 oferta aprobada durante Buen Fin.', '🎉', 'temporadas', 'common', 60, false, true, false, 680),
('buen_fin_3', 'Buen Fin en serio', 'Publica 3 ofertas aprobadas durante Buen Fin.', '🎉', 'temporadas', 'uncommon', 120, false, true, false, 690),
('buen_fin_8', 'Buen Fin a fondo', 'Publica 8 ofertas aprobadas durante Buen Fin.', '🎉', 'temporadas', 'rare', 220, false, true, false, 700),
('navidad_1', 'Primera de Navidad', 'Publica 1 oferta aprobada durante Navidad.', '🎉', 'temporadas', 'common', 60, false, true, false, 710),
('navidad_5', 'Cinco de Navidad', 'Publica 5 ofertas aprobadas durante Navidad.', '🎉', 'temporadas', 'uncommon', 140, false, true, false, 720),
('navidad_15', 'Navidad completa', 'Publica 15 ofertas aprobadas durante Navidad.', '🎉', 'temporadas', 'rare', 260, false, true, false, 730),
('seasons_two', 'Dos temporadas', 'Publica al menos una oferta aprobada en 2 temporadas distintas.', '🎉', 'temporadas', 'rare', 200, false, true, false, 740),
('seasons_three', 'Las tres temporadas', 'Publica al menos una oferta aprobada en Día de Muertos, Buen Fin y Navidad.', '🎉', 'temporadas', 'legendary', 640, false, true, false, 750)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  category = excluded.category,
  rarity = excluded.rarity,
  xp_reward = excluded.xp_reward,
  is_hidden = excluded.is_hidden,
  is_active = true,
  is_repeatable = false,
  display_order = excluded.display_order;

update public.achievements
set is_active = false
where code not in ('first_trail', 'hunter_three', 'hunter_moving_1', 'hunter_ten', 'hunter_moving_2', 'hunter_fifty', 'hunter_moving_3', 'hunter_veteran', 'hunter_five_hundred', 'hunter_thousand', 'offer_spark', 'first_mark', 'growing_impact', 'featured_offer', 'offer_beacon', 'clean_first', 'good_eye', 'clean_fifteen', 'clean_forty', 'clean_hundred', 'clean_two_fifty', 'quality_first', 'bargain_detector', 'quality_twenty_five', 'quality_fifty', 'quality_hundred', 'rate_ten', 'precise_hunter', 'eagle_eye', 'rate_hundred', 'first_help', 'good_contribution', 'community_favorite', 'community_reference', 'influential_hunter', 'great_impact', 'aventa_footprint', 'comment_like_first', 'conversationalist', 'conversation_first', 'conversation_ten', 'participant', 'vote_first', 'vote_twenty_five', 'vote_hundred', 'first_fire', 'constant_hunter', 'distinct_month', 'perfect_week', 'disciplined_hunter', 'unstoppable', 'legend', 'first_step', 'contributor', 'hunter_rank', 'early_bird', 'night_hunter', 'flash_hunter', 'secret_offer', 'categories_two', 'categories_four', 'categories_six', 'stores_three', 'stores_ten', 'favorites_ten', 'muertos_1', 'muertos_2', 'buen_fin_1', 'buen_fin_3', 'buen_fin_8', 'navidad_1', 'navidad_5', 'navidad_15', 'seasons_two', 'seasons_three');

alter table public.achievements drop constraint if exists achievements_category_check;

alter table public.achievements add constraint achievements_category_check
  check (category = any (array[
    'caza','calidad','comunidad','progresion','exploracion','temporadas',
    'experiencia','especiales'
  ]));
