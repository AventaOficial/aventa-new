# Decision Map — CONTROL

**Evidence:** E3  
Sin evaluar calidad de decisión.

| DECISION-ID | Pantalla | Decisión | Opciones visibles | Información disponible |
|---|---|---|---|---|
| DEC-01 | `/` Hero/ActionBar | ¿Auth ahora? | Abrir register/login; continuar anónimo | Nav, marca |
| DEC-02 | `/` | ¿Qué modo de feed? | vitales / top / latest / (personalized si auth) | Chips/tabs |
| DEC-03 | `/` top | ¿Ventana temporal? | day / week / month | Tabs tiempo |
| DEC-04 | `/` / categoría | ¿Filtrar categoría/tienda? | Chips / rail tiendas | Labels categoría/tienda |
| DEC-05 | `/` | ¿Buscar texto? | SearchField | Query string |
| DEC-06 | Card | ¿Abrir detalle? | Click card / CTA Ver oferta | Título, precio, imagen, votos… |
| DEC-07 | Card | ¿Votar sin abrir? | Up/down | Score/votos en card |
| DEC-08 | Card | ¿Favoritar? | Heart | Estado liked |
| DEC-09 | `/oferta/[id]` | ¿Vale la pena? | (implícita) | Detalle completo |
| DEC-10 | Detalle | ¿Outbound? | CTA tienda | URL/tienda/precio |
| DEC-11 | Detalle | ¿Favorito/voto/comentar/share/report? | Controles | Estado + comentarios |
| DEC-12 | ActionBar | ¿Publicar? | Subir | Modal upload |
| DEC-13 | Upload | ¿Con URL o sin enlace? | Parse / continuar sin | Gate |
| DEC-14 | Upload | ¿Enviar oferta? | Submit | Form fields |
| DEC-15 | Nav | ¿Ir a Favoritos / Me / Guía / Plaza? | Tabbar/sidebar | Labels |
| DEC-16 | Plaza | ¿Participar write? | Forms (auth gate) | Contenido plaza |

Opciones no visibles / estados condicionados: UNKNOWN sin matriz exhaustiva de props por offer status.
