# AVENTA — Informe en prosa (estado del producto, gaps y riesgos)

Documento **narrativo** para alinear visión técnica y operativa. Sintetiza revisiones externas (DeepSeek, Gemini) contrastadas con el código actual del repo. **No sustituye** `docs/CONTEXTO_SISTEMA_AVENTA.md` ni los checklists; sirve de “consultor interno” en texto corrido.

**Última lectura recomendada del código:** regenerar `Codigo_Completo.txt` con `node scripts/export-codigo-completo.mjs` cuando quieras contexto íntegro para otra IA.

---

## 1. Qué es AVENTA hoy (sin marketing)

AVENTA es una aplicación **Next.js + Supabase + Vercel** orientada a **ofertas**, con **feed**, **subida y moderación**, **votos ponderados por reputación**, **comentarios**, **afiliados** en enlaces, **bot de ingesta** con scoring y límites diarios, y paneles de **admin/operaciones**. La base es sólida para una **fase de validación** y beta; no es todavía, por volumen y operación, un sustituto funcional de agregadores con años de comunidad y SEO masivo.

---

## 2. Bot de ingesta: motor sí, “llave de encendido” aparte

El flujo vive en `lib/bots/ingest/` y se expone en `GET /api/cron/bot-ingest` protegido con `CRON_SECRET`. La lógica **sí** puede recolectar candidatos (Mercado Libre por API, Amazon por ASINs/URLs, URLs del env), filtrar, puntuar e insertar en `offers` con enlaces normalizados.

En **Vercel Hobby**, los crons del proyecto solo pueden ejecutarse **como máximo una vez al día** por job. Por eso **no** incluimos `bot-ingest` en `vercel.json`: el deploy fallaba con expresiones tipo cada 15 minutos. Eso **no** significa que el bot esté roto; significa que **el disparador automático** es responsabilidad fuera del archivo de crons por defecto:

- **Vercel Pro:** puedes volver a registrar el job con `*/15 * * * *` en `vercel.json`.
- **Cron externo** (p. ej. cron-job.org): `GET` a tu dominio con el mismo secreto que ya valida la ruta.
- **Manual:** panel **Trabajo → Ejecutar ahora** (o llamada autenticada equivalente).

Hasta que uno de esos tres esté activo en producción, es más honesto decir: **el bot no corre solo**; **sí está listo para correr** cuando configures el disparador.

---

## 3. Afiliados y enlaces de usuario

Al crear oferta, el servidor usa **`resolveAndNormalizeAffiliateOfferUrl`**: expande acortadores (`meli.la`, `amzn.to`, `a.co` cuando aplica) y aplica **`applyPlatformAffiliateTags`** según variables (`AMAZON_ASSOCIATE_TAG`, `ML_AFFILIATE_TAG`, etc.). En la UI, **`buildOfferUrl`** vuelve a aplicar tags de plataforma en dominios conocidos y puede respetar el tag ML del creador si no hay tag de plataforma (política de producto: conviene tenerla clara con “cazadores” líderes).

**Mercado Libre:** el código añade **`?tag=`**, no `matt_word`. El valor debe salir del **programa de afiliados/colaboradores** de ML para fichas de producto, no asumir que la etiqueta del perfil social es la misma.

**Qué falta en la práctica:** tener **todas** las variables correctas en Vercel y **probar** una oferta ML y una Amazon comprobando `offer_url` en base de datos o en el CTA “Ver oferta en tienda”.

---

## 4. Competir con Promodescuentos (u otros gigantes)

**Con honestidad:** no compites hoy en **volumen de contenido**, **antigüedad de dominio**, **backlinks** ni **equipo editorial** con un player tipo Pepper/Promodescuentos. Eso no desmerece el código; es una **brecha de negocio y operación**.

Donde AVENTA puede **diferenciarse** a medio plazo (si se ejecuta bien): nicho (México, categorías vitales, tech), **reputación que pesa en votos**, moderación visible, y experiencia de cazador. Ninguna de esas ventajas se materializa sola sin **tráfico**, **ofertas frescas** y **costumbre de uso**.

---

## 5. Lo que está bien encarrilado (técnicamente)

- Arquitectura clara: App Router, APIs en `app/api`, lógica en `lib/`, RLS en Supabase.
- Moderación con cola, acciones en lote, enlaces y reportes.
- Contratos y tests de contrato en partes críticas (`tests/contracts`, `tests/bots`).
- Sitemap, metadata y piezas de SEO base.
- Documentación viva (`CONTEXTO_SISTEMA_AVENTA`, checklists, modo solo moderación del bot).

---

## 6. Riesgos y mejoras que surgieron en revisiones externas (priorizar)

Estos puntos **merecen ticket o decisión explícita**; no todos están verificados línea a línea en esta sesión.

| Tema | Idea | Notas |
|------|------|--------|
| **Realtime en home** | Suscripción amplia a cambios en `offers` puede escalar mal en usuarios concurrentes. | Revisar `useOffersRealtime`: acotar, paginar, o refresco bajo demanda. |
| **Home como client fetch** | SEO y LCP: valor de traer **primera página** desde servidor. | Valorar Server Component + datos iniciales. |
| **Ranking vs eventos** | Si los clics/outbound no alimentan el mismo pipeline que dispara recálculos que los votos, el “viral por clics” puede quedar subrepresentado. | Revisar triggers/vistas documentados y `offer_events`. |
| **Duplicados al subir** | Similar solo ayuda al moderador; el usuario puede encolar la misma URL varias veces. | Endurecer en API o UX al pegar URL. |
| **Estados de error en feed** | `catch` que deja lista vacía puede parecer “sitio muerto”. | Mensajes de error/reintento visibles. |
| **Amazon** | Scraping intensivo sin PA-API tiene riesgo operativo a largo plazo. | Plan B: API oficial cuando haya tráfico/comisiones. |
| **Redis / rate limit** | Sin Upstash en producción, límites pueden degradarse. | Confirmar env en Vercel. |

---

## 7. Corrección sobre “bug crítico al anular voto”

Algún análisis sugirió que al anular se enviaba `value: 0` y la API lo rechazaría. En el flujo actual de **página de oferta**, el cliente usa **`postOfferVote`** con `{ offerId, direction: 'up' | 'down' }` (`lib/votes/client.ts`). El servidor (`app/api/votes/route.ts`) **detecta si el voto existente coincide con la dirección** y, en ese caso, **elimina la fila** (anulación). Por tanto, **no depende** de enviar cero al API. Si en otro componente legacy se enviara solo `value: 0`, ahí sí habría que revisar; el camino principal documentado aquí es coherente.

---

## 8. Plan breve en prosa (qué hacer antes de “competir en serio”)

1. **Disparar el bot** con cron externo o Pro; ajustar `BOT_INGEST_DAILY_MAX` y fuentes (ML + ASINs + URLs).
2. **Validar afiliados** en producción con URLs reales (Amazon + ML).
3. **Pasar** `docs/CHECKLIST_EXPORT_BOT_Y_QA.md` y una sesión de QA móvil.
4. **Elegir** 1–2 mejoras de la tabla de riesgos (realtime, SSR home, duplicados) según tu próximo cuello de botella.
5. **Sembrar** contenido y beta acotada; medir retención y calidad antes de escalar marketing.

---

## 9. Cómo mantener este informe

Cuando cambien decisiones grandes (cron, afiliados, roles), actualiza **este archivo** o añade una subsección con fecha. Para detalle de rutas y env, la fuente de verdad sigue siendo **`docs/CONTEXTO_SISTEMA_AVENTA.md`** y **`.env.example`**.
