/**
 * Canon editorial. Un registro por Hunter, los mismos campos para todos.
 * No es un componente ni una regla de permisos.
 *
 * Cada ficha nace en draft. Avatar, portada, ícono y color quedan vacíos
 * hasta que el Owner suba los assets y elija el acento. Ninguno es público
 * mientras siga en borrador.
 */
import type { HunterWriteInput } from './contract';

function hunter(
  input: Pick<HunterWriteInput, 'code' | 'slug' | 'name' | 'displayName' | 'title' | 'specialty' | 'sortOrder'> & {
    shortBio: string;
    personality: readonly string[];
    longBio: readonly string[];
  },
): HunterWriteInput {
  return {
    ...input,
    personality: input.personality.join('\n\n'),
    longBio: input.longBio.join('\n\n'),
    avatarUrl: null,
    coverUrl: null,
    icon: null,
    accent: null,
    status: 'draft',
  };
}

export const XIMENA_FUEGO: HunterWriteInput = hunter({
  code: 'ximena',
  slug: 'ximena-fuego',
  name: 'Ximena',
  displayName: 'Ximena "Fuego"',
  title: 'Cazadora de Conexiones',
  specialty: 'Exploración / Estrategia',
  sortOrder: 1,
  shortBio: 'Mexicana, de Guadalajara. «Donde otros ven fronteras, yo veo oportunidades.»',
  personality: [
    'Carismática, optimista, ingeniosa, sociable, leal y competitiva.',
    'Siempre ve el lado positivo, incluso en el caos. Conecta personas, ideas y lugares. Tiene un humor único y una energía contagiosa que motiva al equipo. No se rinde fácil y protege a los suyos con ferocidad.',
  ],
  longBio: [
    'Tiene 22 años. Nació en Guadalajara, Jalisco, y caza como exploradora y estratega: movilidad, reconocimiento, soporte y control de área. Su afiliación es Hunters, independiente.',
    'Sus territorios son las ofertas, la exploración, la comunidad, la logística y la cultura. Mapea áreas, detecta recursos, mueve comercio y sostiene al equipo.',
    'Es la hija mayor de una familia trabajadora. Su madre tiene un pequeño restaurante de comida tradicional en Guadalajara. Su hermano menor la ve como un ejemplo a seguir. Lleva su cultura y su familia con orgullo a donde va.',
    'Le gustan los tacos al pastor, la música de Peso Pluma, Bad Bunny, regional e indie latino, bailar reggaetón y cumbia, viajar y conocer culturas, la fotografía urbana, coleccionar llaveros, y sus amigos y su familia.',
    'No le gustan la injusticia, la gente falsa, el desperdicio de comida, que subestimen a su país, madrugar (aunque lo hace igual) ni la burocracia.',
    'Su herramienta es el arco modular Solares: un arco de alto rendimiento con tecnología de rastreo, que dispara flechas de exploración, marcador, red o luz según la misión.',
    'La acompaña Chispa, un dron asistente aéreo para mapeo, comunicaciones y apoyo táctico, personalizado con estética mexicana.',
  ],
});

const ISABELLA_RITMO = hunter({
  code: 'isabella',
  slug: 'isabella-ritmo',
  name: 'Isabella',
  displayName: 'Isabella "Ritmo"',
  title: 'Exploradora Cultural',
  specialty: 'Exploradora / Creadora',
  sortOrder: 2,
  shortBio: 'Colombiana, de Medellín. «Las mejores ofertas también nos llevan a nuevos lugares.»',
  personality: [
    'Alegre, creativa, sociable, curiosa, espontánea y empática.',
    'Siempre ve el lado emocionante de todo. Le encanta descubrir ofertas diferentes, lugares nuevos y compartir sus hallazgos con la comunidad. Tiene una energía contagiosa, es muy sociable y siempre está dispuesta a ayudar. Encuentra inspiración en la cultura, la música y las personas.',
  ],
  longBio: [
    'Tiene 22 años. Nació en Medellín y caza como exploradora y creadora: creatividad, conexión y descubrimiento. Su afiliación es Hunters, independiente. Su otra frase es «Ofertas que saben a aventura.»',
    'Busca ofertas distintas, arma mapas de lugares y detecta precios. Lo que encuentra lo comparte con la comunidad.',
    'Vive con su madre y su hermanita menor. Su familia le enseñó a valorar sus raíces, ser trabajadora y llevar alegría a donde va. Sueña con viajar por el mundo y mostrar la riqueza de su cultura.',
    'Le gustan el café colombiano, la música de reggaetón, salsa y pop, viajar y conocer culturas, la fotografía y el contenido, la comida típica (arepas, bandeja), la moda urbana, las playas y la naturaleza, los videojuegos, la tecnología y los gadgets, conocer gente nueva, y los eventos y festivales.',
    'No le gustan las personas negativas, la rutina y el aburrimiento, las ofertas falsas, el desorden, las actitudes prepotentes, perder oportunidades, el mal servicio al cliente ni el spam.',
    'Su herramienta es la cámara Horizonte: identifica ofertas, escanea precios y captura los mejores hallazgos. También graba sus aventuras. Tiene escaneo visual, mapa de lugares, detección de precios, compartir con la comunidad y modo exploración.',
    'La acompaña Lulo, un dron que ayuda a encontrar ofertas locales, lugares interesantes y recomienda experiencias únicas.',
  ],
});

const TOMAS_SUR = hunter({
  code: 'tomas',
  slug: 'tomas-sur',
  name: 'Tomás',
  displayName: 'Tomás "Sur"',
  title: 'Analista de Ofertas',
  specialty: 'Analista / Estratega',
  sortOrder: 3,
  shortBio: 'Argentino, de Buenos Aires. «Un buen precio siempre encuentra su camino.»',
  personality: [
    'Analítico, tranquilo, humilde, astuto, ambicioso y sociable.',
    'Siempre analiza antes de comprar. Es tranquilo, pero muy observador y estratégico. Le encanta encontrar oportunidades ocultas, comparar precios y compartir sus hallazgos con la comunidad. Tiene un gran sentido del humor argentino y siempre ve el lado positivo. Cree que con las ofertas correctas se puede vivir mejor y cumplir más sueños.',
  ],
  longBio: [
    'Tiene 22 años. Nació en Buenos Aires y caza como analista y estratega: datos, análisis y oportunidades. Su afiliación es Hunters, independiente. Su otra frase es «Menos precio, más vida.»',
    'Analiza precios en tiempo real, mapea ofertas, avisa descuentos, sincroniza tiendas y mira estadísticas y tendencias. También tiene modo viaje.',
    'Vive con sus padres y su hermana menor. Su familia siempre lo ha apoyado y le ha enseñado el valor del esfuerzo. Quiere ayudar a que su familia tenga una mejor vida y viajar por Argentina conociendo nuevos lugares.',
    'Le gustan el fútbol (Messi), el asado, el mate (siempre), la música (rock nacional, trap), viajar por Argentina, la fotografía urbana, la tecnología y los gadgets, el senderismo y la naturaleza, los videojuegos, leer y aprender, la economía y las finanzas, conocer nuevas personas, y los autos y las motos.',
    'No le gustan la inflación, los precios altos, la gente arrogante, las ofertas falsas, el spam, el desorden, la mala organización, las filas largas, el mal servicio al cliente, las excusas, perder oportunidades ni el ruido excesivo.',
    'Su herramienta es la mochila Travesía: una mochila inteligente con herramientas de análisis, mapas de precios y almacenamiento expandible. Lo acompaña en todas sus aventuras.',
    'Lo acompaña Gaucho, un dron que rastrea oportunidades, compara precios y encuentra las mejores ofertas en tiendas de todo el país.',
  ],
});

const KAI_SHIN = hunter({
  code: 'kai',
  slug: 'kai-shin',
  name: 'Kai',
  displayName: 'Kai "Shin"',
  title: 'Cazador Estratégico',
  specialty: 'Analista / Estratega',
  sortOrder: 4,
  shortBio: 'Japonés, de Tokio. «La disciplina también te lleva a las mejores oportunidades.»',
  personality: [
    'Tranquilo, analítico, disciplinado, curioso, perfeccionista y visionario.',
    'Siempre analiza antes de actuar. Le gustan los datos, las tendencias y encontrar patrones en las ofertas. Aunque es serio, tiene un lado amigable y apoya a los demás cazadores. Cree que la información correcta en el momento correcto puede cambiar la vida de las personas.',
  ],
  longBio: [
    'Tiene 21 años. Nació en Tokio y caza como analista y estratega: calma, precisión y análisis de datos. Su afiliación es Hunters, independiente. Su otra frase es «Los datos también cazan.»',
    'Lee tendencias, arma un radar de ofertas, un mapa de calor y predice descuentos. Analiza en tiempo real.',
    'Vive solo en Tokio. Sus padres trabajan en tecnología. Siempre lo han apoyado en su forma de ver el mundo. Quiere hacerlos sentir orgullosos y demostrar que su camino también tiene propósito.',
    'Le gustan el ramen (especialmente picante), la tecnología y los gadgets, el anime y el manga, la fotografía urbana, los trenes y las ciudades, los videojuegos, la lectura y la estrategia, la cultura tradicional japonesa, el senderismo (Monte Fuji), la música lo-fi y electrónica, los gatos, y descubrir nuevas tendencias.',
    'No le gustan el desorden, la gente imprudente, las decisiones sin lógica, el ruido excesivo, las ofertas falsas, perder el tiempo, el spam, la falta de disciplina, las multitudes ni la comida muy dulce.',
    'Su herramienta es la katana Análisis: una katana moderna que simboliza precisión y enfoque. La usa como herramienta y recordatorio de disciplina.',
    'Lo acompaña Haru, un dron que analiza precios, detecta tendencias y alerta sobre oportunidades en segundos.',
  ],
});

const LIVIA_SAMBA = hunter({
  code: 'livia',
  slug: 'livia-samba',
  name: 'Lívia',
  displayName: 'Lívia "Samba"',
  title: 'Exploradora de Ofertas',
  specialty: 'Exploradora / Creadora',
  sortOrder: 5,
  shortBio: 'Brasileña, de São Paulo. «Boas ofertas sempre encontram o seu caminho.»',
  personality: [
    'Alegre, carismática, espontánea, sociable, creativa y extrovertida.',
    'Vive cada día como una nueva oportunidad. Siempre encuentra las mejores ofertas con una sonrisa y contagia su energía a todos. Ama la música, el fútbol y la cultura brasileña. Cree que ahorrar también es una forma de libertad y que las buenas ofertas hacen la vida más feliz. Le encanta conocer gente nueva, compartir descubrimientos y ayudar a la comunidad.',
  ],
  longBio: [
    'Tiene 21 años. Nació en São Paulo y caza como exploradora y creadora: agilidad, carisma y conexión social. Su afiliación es Hunters, independiente. Su otra frase es «Oferta boa é vida melhor.»',
    'Motiva al equipo, atrae ofertas cercanas, mapea eventos y tiendas, y comparte con la comunidad. Tiene modo fiesta.',
    'Vive con su madre y su hermana menor. Su familia siempre le ha enseñado el valor de la alegría, el esfuerzo y la unión. Sueña con viajar por todo Brasil, conocer nuevas culturas y mostrar la riqueza de su país al mundo.',
    'Le gustan el fútbol (Seleção), la música (funk, bossa nova, samba), la comida brasileña (feijoada, açaí), las playas y la naturaleza, la fotografía urbana, viajar y conocer culturas, la moda streetwear, los videojuegos, la danza (samba, forró), la tecnología y los gadgets, conocer gente nueva, y los eventos y festivales.',
    'No le gustan el racismo, la injusticia, las personas negativas, la rutina aburrida, las ofertas falsas, el desorden, perder el tiempo, el mal servicio al cliente, la falta de respeto, las excusas ni la mala vibra.',
    'Su herramienta es la bocina Vibe: una bocina portátil que reproduce música para motivar al equipo y atraer a la comunidad. También puede emitir alertas de ofertas cercanas.',
    'La acompaña Zuzu, un dron que encuentra ofertas, detecta eventos locales y recomienda experiencias únicas en Brasil.',
  ],
});

const ELEONORE_NOIR = hunter({
  code: 'eleonore',
  slug: 'eleonore-noir',
  name: 'Éléonore',
  displayName: 'Éléonore "Noir"',
  title: 'Estratega e Ilusión',
  specialty: 'Control / Información',
  sortOrder: 6,
  shortBio: 'Francesa, de París. «Las mejores oportunidades se encuentran en los detalles.»',
  personality: [
    'Elegante, calculadora, observadora, creativa, carismática y misteriosa.',
    'Siempre analiza el panorama completo. Tiene un estilo refinado y seguro, y encuentra oportunidades donde otros solo ven caos. Le gusta jugar con la percepción, descubrir patrones y compartir ofertas exclusivas. Cree que la información también es poder, y que una buena decisión puede cambiar el día de alguien.',
  ],
  longBio: [
    'Tiene 23 años. Nació en París y caza en control e información: estrategia, análisis y engaño visual. Su afiliación es Hunters, independiente. Su otra frase es «Voir plus loin.» (Ver más allá.)',
    'Proyecta hologramas, mapea oportunidades, escanea descuentos, usa cebo visual y un campo de camuflaje.',
    'Vive con su padre, un chef, y su madre, una diseñadora de moda. Desde pequeña creció entre cultura, arte y buena comida, lo que la hizo apreciar los detalles y la calidad. Viaja seguido por Europa en busca de nuevas experiencias, inspiración y, claro, ofertas únicas.',
    'Le gustan el café y los croissants, la moda y el diseño, los museos y el arte, la fotografía urbana, viajar por Europa, los vinos y la gastronomía, la tecnología minimalista, la lectura y la estrategia, las series y el cine, y descubrir lugares nuevos.',
    'No le gustan la desorganización, las decisiones impulsivas, la gente superficial, las copias baratas, perder el tiempo, el ruido excesivo, las multitudes, las falsas oportunidades, la falta de estética ni el regateo sin sentido.',
    'Su herramienta es el paraguas Lumière: un paraguas táctico con tecnología de proyección. Puede crear hologramas, marcar objetivos y revelar oportunidades ocultas.',
    'La acompaña Belle, un dron que analiza tiendas, compara precios y proyecta información visual en tiempo real.',
  ],
});

const ALEJANDRO_SOL = hunter({
  code: 'alejandro',
  slug: 'alejandro-sol',
  name: 'Alejandro',
  displayName: 'Alejandro "Sol"',
  title: 'Negociador de Ofertas',
  specialty: 'Negociador / Buscador',
  sortOrder: 7,
  shortBio: 'Español, de Madrid. «Siempre hay una mejor oferta, solo hay que saber buscarla.»',
  personality: [
    'Carismático, astuto, sociable, ingenioso, seguro y extrovertido.',
    'Siempre encuentra la forma de conseguir más por menos. Es carismático, extrovertido y tiene un gran sentido del humor. Le encanta negociar, comparar precios y compartir sus descubrimientos con la comunidad. Cree que las buenas ofertas hacen la vida más divertida y que todos deberían disfrutar de más por su dinero.',
  ],
  longBio: [
    'Tiene 22 años. Nació en Madrid y caza como negociador y buscador: estrategia, rapidez, contactos y negociación. Su afiliación es Hunters, independiente. Su otra frase es «Más valor, menos gasto.»',
    'Se mueve rápido, detecta ofertas cercanas, mapea tiendas, enlaza una negociación y usa un impulso de velocidad.',
    'Vive con sus padres y su hermana menor. Su familia tiene un pequeño restaurante, donde aprendió el valor del trabajo y la importancia de la buena comida. Siempre está orgulloso de sus raíces y disfruta compartir la cultura española con los demás.',
    'Le gustan el fútbol (Real Madrid), la buena comida (paella, tapas), la música (reggaetón, pop español), viajar por Europa, conocer nuevas culturas, los videojuegos, la moda urbana, los eventos y festivales, salir con amigos, y la tecnología y los gadgets.',
    'No le gustan los precios inflados, la mala calidad, la gente cerrada de mente, perder oportunidades, la burocracia, las filas largas, el mal servicio al cliente, las estafas, el aburrimiento ni la mala actitud.',
    'Su herramienta es la tabla Furia: su tabla inseparable, ideal para moverse rápido por la ciudad y llegar antes a las mejores ofertas. También sirve para trucos y estilo.',
    'Lo acompaña Tapas, un dron explorador que busca ofertas en tiempo real, analiza precios y alerta sobre descuentos ocultos.',
  ],
});

const SKYE_SPARK = hunter({
  code: 'skye',
  slug: 'skye-spark',
  name: 'Skye',
  displayName: 'Skye "Spark"',
  title: 'Cazadora de Tendencias',
  specialty: 'Scouter / Influencer',
  sortOrder: 8,
  shortBio: 'Estadounidense, de Nueva York. «Las mejores oportunidades están un paso adelante.»',
  personality: [
    'Extrovertida, creativa, segura, ambiciosa, sociable y competitiva.',
    'Siempre ve el lado brillante de las cosas. Es energética, carismática y siempre está un paso adelante en tendencias, tecnología y cultura viral. Convierte cualquier lugar en una oportunidad y motiva a los demás con su actitud. Cree que las ofertas no solo ahorran dinero, sino que abren posibilidades para una vida mejor.',
  ],
  longBio: [
    'Tiene 22 años. Nació en Nueva York y caza como scouter e influencer: tecnología, versatilidad y creatividad. Su afiliación es Hunters, independiente. Su otra frase es «Make it happen!»',
    'Dispara un escaneo, marca tendencias, usa una granada de impulso y tiende una red de detección.',
    'Vive con su hermana menor en Brooklyn. Su madre es fotógrafa y su padre trabaja en tecnología. Siempre los apoya y sueña con darles una vida aún mejor.',
    'Le gustan la música pop, hip hop y rap, la moda urbana y los sneakers, la tecnología y los gadgets, la fotografía y las redes sociales, viajar y conocer ciudades, la comida rápida (burgers, pizza), los videojuegos, los festivales y conciertos, y sus amigos y su familia.',
    'No le gustan la gente negativa, las oportunidades falsas, el conformismo, las reglas sin sentido, perderse una buena oferta, el aburrimiento ni las copias baratas.',
    'Su herramienta es el lanzador Trend: analiza tendencias en tiempo real y detecta ofertas antes que nadie. Puede disparar marcadores holográficos para resaltar oportunidades.',
    'La acompaña Buddy, un dron que analiza redes, tendencias y precios. Siempre encuentra algo interesante y avisa primero.',
  ],
});

const LING_HONG = hunter({
  code: 'ling',
  slug: 'ling-hong',
  name: 'Ling',
  displayName: 'Ling "Hong"',
  title: 'Cazadora de Conexiones',
  specialty: 'Exploradora / Control de área',
  sortOrder: 9,
  shortBio: 'De Chongqing, China. «Cada camino tiene una oportunidad, solo hay que saber dónde mirar.»',
  personality: [
    'Astuta, segura, curiosa, disciplinada, sociable y competitiva.',
    'Siempre está un paso adelante. Observa, analiza y convierte cualquier lugar en una ventaja táctica. Combina la disciplina tradicional con una mentalidad moderna y urbana. Le encanta conocer gente nueva, descubrir culturas y aprender de todo.',
  ],
  longBio: [
    'Tiene 22 años. Nació en Chongqing y caza como exploradora con control de área: agilidad, trampas y control de espacio. Su afiliación es Hunters, independiente. Su otra frase es «Todo tiene un hilo.»',
    'Lanza ráfagas de viento, marca el área, suelta un dron de reconocimiento y arma trampas de anclaje.',
    'Vive con su abuela, una exartesana de ópera de Sichuan, que le enseñó el valor de la perseverancia y la elegancia. Su padre trabaja en logística internacional y casi siempre está de viaje. Quiere hacer que su familia se sienta orgullosa, llevando la cultura china a todo el mundo.',
    'Le gustan el bubble tea (té de jazmín), la música C-pop, hip hop y lo-fi, los videojuegos y la tecnología, la fotografía de ciudades, viajar y conocer culturas, coleccionar abanicos, la cocina picante (hot pot), y sus amigos y su dron.',
    'No le gustan la injusticia, la gente arrogante, perder el control, los lugares sin vida, las mentiras ni la comida sin sabor.',
    'Su herramienta es el abanico táctico Hong: un abanico de alto rendimiento con tecnología de despliegue rápido. Puede lanzar ráfagas de viento, señales y microdrones.',
    'La acompaña Tuan, un dron multifuncional. Explora, marca objetivos, distrae y brinda soporte táctico.',
  ],
});

const OLIVER_NORTH = hunter({
  code: 'oliver',
  slug: 'oliver-north',
  name: 'Oliver',
  displayName: 'Oliver "North"',
  title: 'Explorador de Descubrimientos',
  specialty: 'Explorador / Analista',
  sortOrder: 10,
  shortBio: 'Canadiense, de Toronto. «Siempre hay una oportunidad detrás de cada esquina.»',
  personality: [
    'Tranquilo, inteligente, amigable, analítico, confiable y aventurero.',
    'Siempre analiza antes de actuar. Es curioso, observador y tiene un gran sentido estratégico. Le gusta explorar tanto ciudades como ofertas, siempre buscando el mejor camino. Aunque parece calmado, tiene un lado aventurero y competitivo. Cree en compartir oportunidades para que todos puedan lograr más.',
  ],
  longBio: [
    'Tiene 21 años. Nació en Toronto y caza como explorador y analista: estrategia, análisis y precisión. Su afiliación es Hunters, independiente. Su otra frase es «Better deals, a brighter tomorrow.»',
    'Escanea ofertas, mapea oportunidades, usa reconocimiento, filtra ofertas falsas y tiene modo exploración nocturna.',
    'Vive con sus padres y un hermano mayor. Su familia siempre le ha enseñado el valor de la perseverancia, la humildad y ayudar a los demás. Quiere que todos tengan acceso a las mejores oportunidades, sin importar dónde vivan.',
    'Le gustan el café (especialmente Tim Hortons), el hockey y los deportes de invierno, la música indie y lo-fi, el senderismo y la naturaleza, la tecnología y los drones, la fotografía de paisajes, viajar y conocer nuevas culturas, los videojuegos, las mascotas (especialmente perros), y las ciudades y la arquitectura.',
    'No le gustan las mentiras, la falta de preparación, el desperdicio, la gente egoísta, el mal servicio al cliente, el ruido excesivo, las oportunidades falsas ni el pesimismo.',
    'Su herramienta es el escáner Aurora: un escáner de alta precisión que detecta ofertas, tendencias y oportunidades en tiempo real. Puede mapear múltiples fuentes y mostrar la mejor ruta.',
    'Lo acompaña Maple, un dron que explora, analiza y encuentra las mejores oportunidades. Siempre lo acompaña en sus misiones.',
  ],
});

/** Mismo contrato para los diez. El orden 1 es Ximena; el resto sigue el orden de las fichas. */
export const EDITORIAL_CANON: readonly HunterWriteInput[] = [
  XIMENA_FUEGO,
  ISABELLA_RITMO,
  TOMAS_SUR,
  KAI_SHIN,
  LIVIA_SAMBA,
  ELEONORE_NOIR,
  ALEJANDRO_SOL,
  SKYE_SPARK,
  LING_HONG,
  OLIVER_NORTH,
];
