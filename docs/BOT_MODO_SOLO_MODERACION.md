# Bot en modo “solo yo moderó” + ~50 ofertas al día

Objetivo: **el bot encuentra ofertas en Mercado Libre y/o Amazon**; **tú solo entras a moderar** (aprobar/rechazar). Nadie más depende de ti para subir contenido.

---

## 1. Que todo pase por tu moderación

En **Vercel** añade o edita:

```env
BOT_INGEST_AUTO_APPROVE=0
```

Con eso **ninguna** oferta del bot sale `approved` por el score: **todas entran como `pending`** (salvo que cambies esto). El score sigue guardándose en el comentario de moderación para que priorices.

*(Antes no bastaba poner `BOT_INGEST_AUTO_APPROVE_MIN_SCORE=101` porque el score máximo es 100.)*

---

## 2. Acercarte a ~50 ofertas nuevas por día

Con **Vercel Pro** o un **cron externo** puedes disparar el bot cada **~15 minutos** (~96 veces/día). En **Vercel Hobby** no puede ir ese intervalo en `vercel.json`; automatiza con servicio externo + `CRON_SECRET` (paso a paso en **[docs/CRON_EXTERNO_BOT.md](./CRON_EXTERNO_BOT.md)**) o usa **Ejecutar ahora**. El tope diario corta cuando se alcanza.

Ejemplo de variables:

```env
BOT_INGEST_DAILY_MAX=50
BOT_INGEST_NORMAL_MAX_MIN=1
BOT_INGEST_NORMAL_MAX_MAX=2
BOT_INGEST_TIMEZONE=America/Mexico_City
```

- Con **1–2 insertaciones exitosas por corrida** en promedio puedes acercarte a **50/día** hasta que `DAILY_MAX` frene.
- Si ves **pocas inserciones** (mucho `duplicate` o `skipped`): sube **`BOT_INGEST_CANDIDATE_POOL_MAX`**, activa **`BOT_INGEST_DISCOVER_ML=1`**, amplía **`BOT_INGEST_AMAZON_ASINS`** o **`BOT_INGEST_URLS`**, o baja un poco **`BOT_INGEST_MIN_DISCOUNT_PERCENT`** (con cuidado).

El **boost matutino** (`BOT_INGEST_BOOST_MAX`, hora local) mete muchas en una ventana; si prefieres reparto más uniforme, baja `BOOST_MAX` o ajusta la ventana (ver `.env.example`).

---

## 3. Buen descuento (lo que el bot sí hace hoy)

- **Mercado Libre:** API con **`original_price`** (precio tachado) + filtros de % mínimo, vendidos, condición nueva, reseñas opcionales.
- **Amazon:** parseo de HTML + JSON-LD; descuento cuando la página expone precio actual vs original de forma fiable.

**Importante:** el bot **no** comprueba hoy si el precio es el **más bajo histórico** de ese producto. Eso exige otra fuente (p. ej. APIs tipo Keepa/Camel para Amazon, o datos propios de precios en el tiempo). Si quieres eso como regla dura, es **desarrollo aparte**.

Mientras tanto, puedes exigir **descuentos altos** con:

```env
BOT_INGEST_MIN_DISCOUNT_PERCENT=25
```
(ajusta al riesgo que quieras).

---

## 4. Fuentes ML + Amazon (recomendado para no depender solo de URLs)

```env
BOT_INGEST_DISCOVER_ML=1
BOT_INGEST_ML_USE_DEFAULT_QUERIES=1
BOT_INGEST_AMAZON_ASINS=B0XXXX...,B0YYYY...
```

Y tags de afiliado:

- Amazon: ya usas `AMAZON_ASSOCIATE_TAG` / `NEXT_PUBLIC_…`
- Mercado Libre: `ML_AFFILIATE_TAG` o `NEXT_PUBLIC_ML_AFFILIATE_TAG` (si no, los enlaces ML pueden ir sin `tag`)

---

## 5. Tu rutina diaria (mínima)

1. **Admin → Moderación:** filtra por autor bot o por comentario `[bot-ingest`.
2. Revisa precio/enlace y aprueba o rechaza.
3. Opcional: **Operaciones → Bot** para ver si hubo errores o tope diario.

---

## 6. Resumen de env para tu caso

| Variable | Valor orientativo |
|----------|-------------------|
| `BOT_INGEST_AUTO_APPROVE` | `0` |
| `BOT_INGEST_DAILY_MAX` | `50` |
| `BOT_INGEST_NORMAL_MAX_MIN` / `MAX` | `1` / `2` |
| `BOT_INGEST_DISCOVER_ML` | `1` |
| `BOT_INGEST_AMAZON_ASINS` | lista curada |
| `BOT_INGEST_MIN_DISCOUNT_PERCENT` | `20`–`35` según calidad |

---

## 7. Agenda de mantenimiento (Operaciones / Trabajo)

El mantenimiento recurrente (afiliados, env Vercel, fuentes del bot, crons, Supabase, auditoría npm) está centralizado en **`docs/AGENDA_MANTENIMIENTO_OPERACIONES.md`**: frecuencias sugeridas, **prompts** para pegar en el chat con IA y una sección **historial** donde copias un bloque por cada revisión.

En el panel: **Admin → Mantenimiento** (`/admin/mantenimiento`) — versión interactiva (calendario, copiar prompts, historial en localStorage).

---

*Más contexto técnico: `docs/CONTEXTO_SISTEMA_AVENTA.md` y `docs/CHECKLIST_EXPORT_BOT_Y_QA.md`.*
