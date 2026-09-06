# HSE Task Catalog

**Protocolo:** HSE-00  
**IDs:** TASK-001 … TASK-015  
**Nota:** Las métricas listadas son **familias** (ver [METRICS.md](./METRICS.md)). No se inventan valores numéricos aquí.

---

## Convenciones de ficha

| Campo | Significado |
|---|---|
| Objetivo | Qué intenta lograr la persona |
| Precondiciones | Estado mínimo al inicio |
| Inicio | Disparador / pantalla de partida |
| Pasos esperados | Camino feliz (CONTROL) — descriptivo, no rediseño |
| Resultado esperado | Criterio de éxito de tarea |
| Errores posibles | Fallos recuperables o no |
| Abandono | Puntos donde la sesión puede salir del camino |
| Métricas | Familias a registrar (sin inventar números) |

Etiquetar tiempos/conteos futuros como `SIMULATED` o `OBSERVED`.

---

## TASK-001 — Encontrar una oferta interesante

| Campo | Contenido |
|---|---|
| Objetivo | Identificar al menos una oferta que el usuario juzgue digna de atención. |
| Precondiciones | Acceso al feed/Home o superficie de descubrimiento; puede ser anónimo o autenticado. |
| Inicio | ENTRY → DISCOVERY (típicamente Home). |
| Pasos esperados | Orientarse → scroll/explorar → fijar atención en ≥1 card. |
| Resultado esperado | Usuario puede señalar una oferta “interesante” (auto-reporte o proxy: apertura de detalle / favorito / outbound). |
| Errores posibles | Feed vacío; confusión de ranking; fatiga de scroll. |
| Abandono | Salida sin fijar atención; bounce temprano. |
| Métricas | TIME, SCROLLS, INTERACTIONS, ABANDONMENT, TASK SUCCESS |

---

## TASK-002 — Encontrar una oferta dentro de una categoría específica

| Campo | Contenido |
|---|---|
| Objetivo | Localizar oferta(s) alineadas a una categoría/tema dado. |
| Precondiciones | Categorías/filtros/navegación de categoría disponibles en CONTROL. |
| Inicio | DISCOVERY con intención categorial. |
| Pasos esperados | Elegir categoría/filtro → inspeccionar resultados → seleccionar candidato. |
| Resultado esperado | Al menos un resultado relevante a la categoría pedida. |
| Errores posibles | Filtro incorrecto; categoría vacía; desajuste de taxonomía. |
| Abandono | Volver a feed general sin resultado; salir. |
| Métricas | INTERACTIONS, FILTER events, SCREENS, TASK SUCCESS, FRICTION |

---

## TASK-003 — Evaluar si una oferta realmente vale la pena

| Campo | Contenido |
|---|---|
| Objetivo | Formar un juicio de valor (sí/no/inseguro) con la información disponible. |
| Precondiciones | Oferta visible (card y/o detalle). |
| Inicio | EVALUATION. |
| Pasos esperados | Leer precio/descuento/tienda/señales → opcionalmente abrir detalle → juicio. |
| Resultado esperado | Decisión explícita del usuario (vale / no vale / no sé). |
| Errores posibles | Información faltante; señales contradictorias; anclaje engañoso. |
| Abandono | Cierre sin juicio; salto a otra oferta. |
| Métricas | DECISIONS, INFORMATION ACCESS/IGNORE, TIME, COGNITIVE LOAD (estimada), TRUST |

---

## TASK-004 — Abrir los detalles de una oferta

| Campo | Contenido |
|---|---|
| Objetivo | Acceder a la vista de detalle (página o modal según CONTROL). |
| Precondiciones | Oferta visible en listado. |
| Inicio | DISCOVERY → ACTION de apertura. |
| Pasos esperados | Click/tap en card o CTA de detalle → detalle cargado. |
| Resultado esperado | Detalle usable (contenido principal visible). |
| Errores posibles | Error de carga; detalle incompleto; navegación incorrecta. |
| Abandono | Back inmediato; cierre de modal. |
| Métricas | CLICKS, TIME, ERRORS, SCREENS, TASK SUCCESS |

---

## TASK-005 — Comparar dos ofertas

| Campo | Contenido |
|---|---|
| Objetivo | Contrastar dos ofertas para elegir o descartar. |
| Precondiciones | ≥2 ofertas accesibles. |
| Inicio | DISCOVERY / EVALUATION. |
| Pasos esperados | Abrir/recordar oferta A → oferta B → comparar atributos relevantes. |
| Resultado esperado | Preferencia relativa o empate consciente. |
| Errores posibles | Pérdida de contexto al navegar; memoria de trabajo sobrecargada. |
| Abandono | Comparación incompleta; retorno a scroll sin decisión. |
| Métricas | BACKTRACKS, SCREENS, DECISIONS, COGNITIVE LOAD, TIME |

---

## TASK-006 — Ir desde AVENTA hasta la tienda

| Campo | Contenido |
|---|---|
| Objetivo | Completar outbound hacia el comercio (CTA). |
| Precondiciones | Oferta con URL/CTA; políticas de tracking del CONTROL. |
| Inicio | DECISION → ACTION (INT-OUTBOUND). |
| Pasos esperados | Localizar CTA → activar → salir a destino externo (o confirmación de intento). |
| Resultado esperado | Outbound iniciado correctamente. |
| Errores posibles | CTA ausente; bloqueo; enlace incorrecto; fricción de auth. |
| Abandono | No click; cierre de detalle. |
| Métricas | TASK SUCCESS, CLICKS, FRICTION, ERRORS, TIME |

---

## TASK-007 — Guardar / favoritar una oferta

| Campo | Contenido |
|---|---|
| Objetivo | Marcar oferta como favorita (o quitar) según intención. |
| Precondiciones | Sesión autenticada (si el CONTROL lo exige). |
| Inicio | ACTION (INT-FAV). |
| Pasos esperados | Activar control de favorito → feedback de estado. |
| Resultado esperado | Estado UI alineado con backend (post-éxito). |
| Errores posibles | 401/403/500; rollback incorrecto; doble tap. |
| Abandono | Intento cancelado; salida tras error. |
| Métricas | ERRORS, RETRIES, TASK SUCCESS, INTERACTIONS |

---

## TASK-008 — Votar una oferta

| Campo | Contenido |
|---|---|
| Objetivo | Emitir o cambiar voto según reglas del CONTROL. |
| Precondiciones | Auth y elegibilidad según producto. |
| Inicio | ACTION (INT-VOTE). |
| Pasos esperados | Elegir dirección → confirmar feedback → estado estable. |
| Resultado esperado | Voto registrado o mensaje de rechazo claro. |
| Errores posibles | No elegible; oferta expirada; error de red; doble envío. |
| Abandono | Cancelación; confusión de estado. |
| Métricas | ERRORS, RETRIES, TIME, TASK SUCCESS, FRICTION |

---

## TASK-009 — Comentar una oferta

| Campo | Contenido |
|---|---|
| Objetivo | Publicar un comentario válido. |
| Precondiciones | Auth; superficie de comentarios disponible. |
| Inicio | ACTION (INT-COMMENT / INT-INPUT / INT-SUBMIT). |
| Pasos esperados | Abrir hilo → escribir → enviar → ver comentario. |
| Resultado esperado | Comentario visible o cola de moderación explícita. |
| Errores posibles | Validación; rate limit; fallo de upload de imagen si aplica. |
| Abandono | Borrador descartado; cierre de modal. |
| Métricas | INPUT cost, TIME, ERRORS, TASK SUCCESS |

---

## TASK-010 — Publicar una oferta

| Campo | Contenido |
|---|---|
| Objetivo | Crear una oferta nueva en el sistema. |
| Precondiciones | Auth; permisos; cooldown/límites del CONTROL. |
| Inicio | Flujo de publicación / subida. |
| Pasos esperados | Completar campos → URL/imagen → enviar → confirmación / estado pending. |
| Resultado esperado | Oferta creada o error accionable (p. ej. duplicado 409). |
| Errores posibles | Validación URL; duplicado; upload; ban; cooldown. |
| Abandono | Formulario a medias; salida. |
| Métricas | TIME, ERRORS, RETRIES, DECISIONS, TASK SUCCESS, FRICTION |

---

## TASK-011 — Revisar el estado de una oferta propia

| Campo | Contenido |
|---|---|
| Objetivo | Conocer status de una oferta publicada por el usuario (pending/approved/rejected/etc.). |
| Precondiciones | Usuario con al menos una oferta propia; auth. |
| Inicio | Área de perfil / mis ofertas / panel según CONTROL. |
| Pasos esperados | Navegar a lista propia → identificar oferta → leer estado. |
| Resultado esperado | Estado comprendido por el usuario. |
| Errores posibles | Estado no visible; terminología confusa; oferta no listada. |
| Abandono | No encuentra la sección. |
| Métricas | NAVIGATION COST, SCREENS, TASK SUCCESS, INFORMATION ACCESS |

---

## TASK-012 — Volver a encontrar una oferta previamente vista

| Campo | Contenido |
|---|---|
| Objetivo | Reencontrar una oferta ya vista en la sesión o en historial/favoritos. |
| Precondiciones | Oferta vista antes; memoria o favorito o URL. |
| Inicio | DISCOVERY / favoritos / deep link. |
| Pasos esperados | Usar memoria, favoritos, búsqueda o scroll → localizar. |
| Resultado esperado | Oferta reencontrada. |
| Errores posibles | Feed reorder; expiración; soft-delete; falta de historial. |
| Abandono | Búsqueda fallida. |
| Métricas | TIME, BACKTRACKS, SCROLLS, TASK SUCCESS |

---

## TASK-013 — Usar AVENTA como usuario recurrente

| Campo | Contenido |
|---|---|
| Objetivo | Completar un ciclo de sesión “conocedor”: entrar → descubrir → actuar con menor coste que USER-A. |
| Precondiciones | Modelo USER-E (u otro recurrente); familiaridad declarada en el escenario. |
| Inicio | ENTRY recurrente. |
| Pasos esperados | Atajos mentales del CONTROL (rutas conocidas) → tarea primaria del escenario. |
| Resultado esperado | Completar ≥1 tarea crítica con fricción ≤ F2 (`SIMULATED` o `OBSERVED`). |
| Errores posibles | Cambio de UI no esperado; pérdida de hábitos. |
| Abandono | Sesión corta sin action. |
| Métricas | TIME vs baseline novato, INTERACTIONS, TASK SUCCESS |

---

## TASK-014 — Usar AVENTA desde móvil

| Campo | Contenido |
|---|---|
| Objetivo | Completar una tarea crítica (p. ej. TASK-001 o TASK-006) en viewport móvil. |
| Precondiciones | Viewport móvil; touch. |
| Inicio | ENTRY móvil. |
| Pasos esperados | Los de la tarea ancla, adaptados a tap/scroll vertical. |
| Resultado esperado | Éxito de la tarea ancla en móvil. |
| Errores posibles | Targets pequeños; overlays; teclado virtual; scroll traps. |
| Abandono | Frustración táctil; salida. |
| Métricas | ACCESSIBILITY, CLICKS/TAPS, FRICTION, TASK SUCCESS |

---

## TASK-015 — Usar AVENTA desde desktop

| Campo | Contenido |
|---|---|
| Objetivo | Completar una tarea crítica en desktop (pointer + teclado opcional). |
| Precondiciones | Viewport desktop. |
| Inicio | ENTRY desktop. |
| Pasos esperados | Tarea ancla con hover/click/scroll. |
| Resultado esperado | Éxito de la tarea ancla en desktop. |
| Errores posibles | Hover-only affordances; densidad; ventanas/modales. |
| Abandono | Igual que tarea ancla. |
| Métricas | ACCESSIBILITY (teclado), INTERACTIONS, TASK SUCCESS |

---

## Matriz rápida tarea × etapas

| Task | ENTRY | DISCOVERY | EVALUATION | DECISION | ACTION | OUTCOME |
|---|---|---|---|---|---|---|
| 001 | ● | ● | ○ | ○ | ○ | ● |
| 002 | ● | ● | ○ | ○ | ○ | ● |
| 003 | ○ | ○ | ● | ● | ○ | ● |
| 004 | ○ | ● | ○ | ○ | ● | ● |
| 005 | ○ | ● | ● | ● | ○ | ● |
| 006 | ○ | ○ | ○ | ● | ● | ● |
| 007–009 | ○ | ○ | ○ | ● | ● | ● |
| 010–011 | ● | ○ | ○ | ● | ● | ● |
| 012–013 | ● | ● | ○ | ○ | ○ | ● |
| 014–015 | ● | ● | ○ | ○ | ○ | ● |

● = núcleo · ○ = posible según escenario
