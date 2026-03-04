# Síntesis: análisis multi-IA de sistemas AVENTA

Composer, Gemini, GPT Codex, Kimi, Opus (Max y estándar) analizaron los sistemas del proyecto. Este doc resume **consensos**, **divergencias** y **opinión directa** sobre lo que midieron y sobre el estado real.

---

## 1. En qué coinciden todas (consenso fuerte)

| Tema | Qué dicen | Mi opinión |
|------|-----------|------------|
| **Votos — backend** | Triggers, vista, CHECK value=2, UNIQUE: correctos tras Supabase. Arquitectura optimistic UI → API → trigger → Realtime es la adecuada. | Correcto. El bloqueo era solo el CHECK; con eso resuelto, el núcleo está bien. |
| **Fórmula del score** | En /me, favoritos y perfil público se usa `up - down` en vez de `up*2 - down`. Inconsistencia crítica. | Correcto. Es bug de producto: el mismo número no significa lo mismo en distintas pantallas. Arreglarlo es prioridad alta. |
| **sync-profile sobrescribe display_name** | Si el usuario cambia el nombre en Configuración, al siguiente login vuelve al de Auth. La regla de 14 días se anula. | Correcto. Es un fallo de diseño del flujo: sync no debe pisar un cambio explícito del usuario. |
| **Estado de ofertas en /me** | El dueño no ve si su oferta está Pendiente, Aprobada, Rechazada o Expirada. Genera confusión y desconfianza. | Correcto. Es la mejora de UX más citada y con más impacto en confianza. |
| **Configuración "meh"** | Estructura plana; falta General/Seguridad/Notificaciones; sin avatar para email; sin cambio seguro de correo. | Correcto. No es solo estética: afecta seguridad (correo) e identidad (avatar). |
| **Link directo `/?o=id`** | No filtra por status/expiración; se pueden ver ofertas rechazadas o expiradas. | Correcto. Riesgo de reputación y de confusión. |
| **"Para ti" no personalizado** | Misma query que Recientes. Expectativa falsa. | Correcto. O se implementa personalización real o se renombra/quita. |
| **Notificación al comentar** | No se notifica al dueño de la oferta cuando alguien comenta. Rompe conversación y retención. | Correcto. Es el gap de notificaciones más mencionado. |
| **Nombre en comentarios → perfil** | El autor no es link a `/u/[slug]`. Se pierde navegación social. | Correcto. Cambio pequeño, impacto claro en exploración. |
| **Doble conteo de reputación** | moderate-offer + increment APIs pueden estar sumando dos veces. | Correcto. Hay que aclarar una sola fuente de verdad. |
| **Realtime en offers** | No se confirma por SQL; hay que revisar en el panel de Supabase. | Correcto. Es verificación operativa, no de código. |
| **SECURITY DEFINER / search_path** | Advertencia de Supabase; revisar vistas que exponen datos. | Correcto. Deuda de seguridad, no bloqueante hoy pero sí para producción seria. |

**Conclusión:** El diagnóstico técnico y de producto está alineado. No hay contradicciones importantes en hechos ni en prioridades de corrección.

---

## 2. Donde hay matices o diferencias de enfoque

| Tema | Enfoques distintos | Mi opinión |
|------|-------------------|------------|
| **Value 2 vs 1 (legacy)** | Algunos piden migrar los 12 votos con value=1 a 2 y quitar soporte de 1. Otros lo ven como deuda menor. | Es limpieza deseable, no urgente. El sistema ya trata 1 y 2 como like; el impacto es más de consistencia de datos que de funcionalidad. |
| **API 200 + ok:false** | Unos: diferenciar 401/500 para mejor UX y debugging. Otros: no lo mencionan. | Tiene sentido diferenciar: el usuario y el equipo debuggean mejor si "sin sesión" y "error de servidor" no se confunden. |
| **Realtime reordena por momentum** | Se señala que el feed inicial usa ranking_blend pero Realtime reordena solo por momentum. | Efecto real pero secundario: el usuario nota sobre todo que los números se actualizan; el reorden puede ser aceptable hasta tener blend en el payload. |
| **Doble conteo de vistas (card + modal)** | Varios lo marcan; no todos lo priorizan igual. | Es real y ensucia CTR. Una sola fuente de vista (p. ej. solo al abrir modal) es más limpio. |
| **"Cazar" = confuso** | Unos: mostrar "Validado por X cazadores" en vez del score crudo. Otros: explicar en guía y tooltips. | Ambas cosas suman: guía + copy más humano. No son excluyentes. |

**Conclusión:** Las diferencias son de prioridad o de solución concreta, no de si el problema existe. Puedes elegir el enfoque que mejor encaje con tu roadmap.

---

## 3. Lo que solo algunas IAs enfatizan (pero es válido)

| Tema | Quién lo sube | Por qué importa |
|------|----------------|-----------------|
| **Notificaciones push (PWA)** | Opus, Kimi | Sin push, el espectador no tiene motivo fuerte para volver; el digest ayuda pero no sustituye "alguien interactuó contigo". |
| **2FA / Sign in with Apple** | Kimi, Gemini | Seguridad y cumplimiento; más crítico cuando escalen usuarios y datos. |
| **Feedback al votar si falla** | Opus, Composer | Revertir en silencio hace pensar que es bug; un toast "No se pudo registrar el voto" mejora la percepción. |
| **Historial de reputación** | Opus, Kimi | "¿Por qué bajé de nivel?" sin respuesta genera frustración; un desglose simple aumenta transparencia. |
| **Exportar / eliminar cuenta** | Kimi, GPT | Privacidad y expectativa regulatoria (GDPR-like); conviene tenerlo en el radar. |
| **Full-text search / escalabilidad búsqueda** | Opus | Con poco volumen no duele; con mucho, `ilike` se vuelve lento. |
| **Agrupación de reportes por oferta** | Varios | "3 usuarios reportaron esta oferta" ayuda al mod más que 3 filas sueltas. |
| **Columna "Cazadas" en admin** | Todas en algún momento | Separa éxito social (votos) de éxito comercial (clics); evita interpretar mal las métricas. |

**Conclusión:** No son inventos; son mejoras reales. La prioridad depende de fase (beta vs crecimiento vs escala).

---

## 4. Opinión sobre lo que midieron las IAs

- **Calidad del análisis:** En conjunto están bien alineadas con el código y con Supabase. Detectan los mismos bugs (score en /me, sync vs settings, estado en /me, doble conteo reputación) y las mismas carencias (avatar, cambio de correo, notificaciones de comentarios, estructura de configuración). Eso da confianza en el diagnóstico.
- **"Nivel Apple":** Parte es UX real (feedback al votar, estados claros, configuración ordenada); parte es pulido (micro-animaciones, haptic, copy más humano). Para beta, lo que bloquea es lo primero. Lo segundo se puede ir haciendo por fases.
- **Riesgo principal:** No es un sistema roto, es **consistencia y comunicación**: mismo score en todas partes, mismo significado de estados, mismo flujo de identidad (nombre/slug/avatar) y notificaciones que cierren el ciclo (comentarios, reportes, moderación). Las IAs apuntan bien a eso.
- **Lo que no se puede delegar a las IAs:** Decidir la métrica norte de la beta (ej. retención 48h), cuánto invertir en push vs digest, y el orden exacto de los 3–5 ítems que atacas primero. Eso es producto y contexto.

---

## 5. Resumen en una frase por sistema

| Sistema | Estado | Una frase |
|---------|--------|-----------|
| **Votos** | Operativo tras fix CHECK | Sólido; falta unificar score en /me y favoritos y mejorar feedback de error. |
| **Ofertas** | Operativo | Buen ranking y flujo; falta estado en /me, filtro en link directo y aclarar "Para ti". |
| **Reportes** | Operativo | Flujo claro; falta feedback al creador y estado visible en /me. |
| **Reputación** | Operativo | Diseño bueno; aclarar doble conteo y dar transparencia (historial/hitos). |
| **Eventos/métricas** | Operativo | Instrumentación correcta; añadir "Cazadas", unificar vista y aclarar retención 48h. |
| **Notificaciones** | Operativo | Agrupación de likes bien; falta notificación de comentarios y, a medio plazo, push. |
| **Auth** | Operativo | Flujo completo; corregir sync vs display_name y slug; después, cambio seguro de correo. |
| **Configuración** | Funcional pero plano | Reestructurar (General/Seguridad/Notificaciones), avatar y cambio de correo. |
| **Comentarios** | Operativo | Falta link a perfil y notificación al dueño (y opcional al autor de la respuesta). |
| **Favoritos** | Operativo | Corregir score; empty state y señal de "expirada" mejoran la experiencia. |
| **Guía/onboarding** | Operativo pero básico | Explicar "Cazar" vs "Ir a tienda", beneficios y menos jerga; más visual. |
| **PWA** | Disponible | Revisar alineación con web; push y, si aplica, service worker son el siguiente paso. |
| **Admin** | Operativo | Roles y panel bien; añadir "Cazadas", health por roles y búsqueda en moderación. |

---

## 6. Orden sugerido (sin tocar código aquí)

1. **Cerrar consistencia y confianza:** score único en todo el producto; estado de ofertas en /me; sync que no pise display_name; slug coherente.
2. **Configuración y seguridad:** reestructura (General/Seguridad/Notificaciones), avatar para email, cambio seguro de correo.
3. **Notificaciones que enganchan:** notificación al dueño cuando comentan en su oferta; luego valorar push para PWA.
4. **Transparencia operativa:** Realtime en panel, SECURITY DEFINER revisado, doble conteo de reputación aclarado, columna "Cazadas" en admin.
5. **Pulido:** guía mejorada, link de autor en comentarios, feedback al fallar voto, retención 48h real en métricas.

Las IAs no se contradicen en lo importante; dan el mismo mapa con distintos énfasis. Este doc sirve como referencia única para priorizar sin re-leer seis análisis completos.
