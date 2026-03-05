# Cómo llevar AVENTA — menos fricción, más práctico

Eres una persona (Jafet) llevando producto, legal, publicidad y operación. No programas; usas IA y producción para lo técnico. La idea de este doc: **automatizar lo que se pueda, simplificar el resto** y que no te lleve todo el día “checar con la IA” y apagar fuegos.

---

## 1. Qué puedes automatizar o simplificar

| Área | Qué hacer | Cómo reducir fricción |
|------|-----------|------------------------|
| **Legal** | Correo real en Privacidad, Términos al día. | Una vez al año (o cuando cambies algo): abre GUIA → checklist “Privacidad”. Sustituye el placeholder por tu correo. Si cambias modelo de datos o uso de datos, pide a la IA: “actualiza /privacy según X” y revisas. No hace falta abogado cada semana. |
| **Publicidad / marketing** | Mensajes, redes, copy. | **Templates en un doc:** “Qué es AVENTA en 1 línea”, “Para qué sirve en 3 bullets”, “CTA para registro”. Cuando necesites post o anuncio, copias y adaptas. La IA puede generar variantes desde ese doc si se lo pasas. |
| **Soporte / bugs** | Usuarios reportan algo, tú lo pasas a la IA. | **Un solo lugar para “pendientes”:** nota en GUIA o un doc “PENDIENTES.md” con: bug (qué pasó, qué esperaban), legal (qué falta), contenido (qué texto cambiar). Cada chat con la IA: “aquí está PENDIENTES.md, ataca lo que toque”. Así no repites contexto. |
| **Métricas** | Retención 48h, activos, CTR. | Ya está en Admin → Métricas. **Una vez por semana** (ej. lunes): entras, anotas en una hoja o doc: “Semana X: activos 24h = …, retención 48h = …, CTR = …”. No hace falta revisar cada día a menos que estés probando algo. |
| **Contenido / ofertas** | Que haya novedad en el feed. | Si tú u otros suben ofertas, ya hay contenido. Si no: ofertas de testers (toggle en Moderación) dan “relleno” para que la gente vea algo. Digest diario/semanal lleva Top 10 al correo; no tienes que curar manual cada día. |
| **Deploy / producción** | Subir cambios. | Git push desde tu repo; Vercel despliega solo. Solo “checar” la página después del push (una pestaña abierta con la URL de prod). Si algo se rompe, copias el error o describes qué ves y lo pasas a la IA. |

---

## 2. Un “sistema” mínimo que no te coma el día

- **Un solo documento de estado:** GUIA_AVENTA.md. Ahí está qué está listo, qué falta, qué toca ahora. No inventes cinco documentos nuevos; todo lo “qué sigue” vive ahí o en FEEDBACK_Y_ROADMAP.
- **Un solo lugar de pendientes:** Un doc (ej. PENDIENTES.md en docs/) o una sección en GUIA con: [ ] Bug: … | [ ] Legal: … | [ ] Copy: … Cuando hables con la IA: “tengo esto en pendientes, resuélvelo” y vas tachando.
- **Una vez a la semana:** Revisar métricas (5 min), leer pendientes (5 min), decidir “esta semana solo arreglo X” o “esta semana solo legal”. No intentes hacer todo cada día.
- **Templates para lo repetitivo:** Un doc con “frases de AVENTA” (qué es, para qué, CTA) y “preguntas frecuentes” (cómo subir oferta, por qué no me aparece, etc.). Cuando alguien pregunte o necesites copy, copias y pegas o pides a la IA que adapte desde ahí.
- **IA solo cuando hace falta:** En vez de “revisar todo con la IA cada día”, junta 3–5 cosas (bugs, un cambio de copy, un checklist) y en un solo chat: “contexto: GUIA_AVENTA.md y PENDIENTES.md; haz esto y esto”. Así reduces idas y vueltas.

---

## 3. Legal, publicidad, “todas las áreas”

- **Legal:** Lo mínimo para estar tranquilo: correo de contacto real en Privacidad, Términos que reflejen lo que hace la app (ya los tienes). Revisión “formal” con abogado cuando tengas ingresos o compromisos fuertes; hasta entonces, mantenerlos coherentes con la app y actualizar si cambias uso de datos.
- **Publicidad:** No hace falta “sistema” complejo al inicio. Un doc de mensajes clave + donde publicas (redes, correo a testers). Si más adelante quieres ads (Meta, Google), se hace brief (a quién, qué mensaje) y creativos; eso puede ser un bloque de trabajo puntual, no diario.
- **Empresa (facturación, contratos, etc.):** Cuando haya ingresos o socios, tocará contador y/o abogado. Hasta entonces, mantener orden: un folder o doc con “qué hemos decidido” (nombre, qué hace AVENTA, métrica norte) para no perder el hilo.

En resumen: **automatizar = templates + un lugar para pendientes + revisión semanal de métricas + git push para deploy**. Simplificar = **no revisar todo cada día; agrupar tareas y pasarlas a la IA en bloque**. Así puedes “cargar” AVENTA sin que te lleve todo el día.
