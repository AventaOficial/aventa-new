# Agenda de mantenimiento — Operaciones / Trabajo

Documento para **revisar el sistema con calendario fijo**, **prompts reutilizables** e **historial** (pegas abajo cada vez que hagas una ronda). Complementa **`docs/BOT_MODO_SOLO_MODERACION.md`** y la ruta **`/operaciones/trabajo`** en la app.

**En la app (owner/admin):** panel **Admin → Mantenimiento** (`/admin/mantenimiento`) — misma agenda en formato “mini cuaderno” con historial y seguimiento en el navegador.

---

## 1. Propuesta “eficiente” (resumen)

**Afiliados**

- **Amazon:** Mantén **`AMAZON_ASSOCIATE_TAG`** y **`NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG`** iguales al ID que ves en [Amazon Associates](https://affiliate-program.amazon.com/). Prefiere guardar URLs **`https://www.amazon.com.mx/dp/ASIN`**; los acortadores **`amzn.to` / `a.co`** el backend intenta expandirlos antes de aplicar `tag`.
- **Mercado Libre:** En AVENTA el código añade **`?tag=`** a dominios Mercado Libre (no `matt_word`). El valor debe ser el que el **programa de colaboradores / afiliados de ML** te indique para enlaces de **ficha de producto** — no asumir que `matt_word` del perfil social es el mismo string. Si ML cambia políticas, la fuente de verdad es su panel y documentación.

**Bot y moderación**

- **`BOT_INGEST_AUTO_APPROVE=0`** si quieres todo en cola humana.
- Revisa **trimestralmente** `BOT_INGEST_URLS`, ASINs y umbrales (`MIN_DISCOUNT`, `DAILY_MAX`): fuentes muertas = desperdicio de corrida y ruido.
- **`app_config.bot_ingest_paused`** (o interruptor en Operaciones): confirma que refleja la intención real (mantenimiento vs apagado).

**Eficiencia del tiempo**

- **Diario:** solo moderación (ya lo tienes en modo solo moderar).
- **Semanal:** 15 min — panel Bot + un vistazo a errores / tope diario.
- **Mensual / trimestral:** tabla de abajo + pegar una entrada en el historial.

---

## 2. Calendario sugerido

| Frecuencia | Área | Qué revisar | Dónde |
|------------|------|-------------|--------|
| **Diaria** | Moderación | Cola bot (`pending`), spam evidente | Admin → Moderación |
| **Semanal** | Bot ingest | Errores, `duplicate`/`skipped`, tope diario alcanzado | Operaciones → Bot / logs Vercel |
| **Semanal** | Pausa global | `bot_ingest_paused` coherente con operación | Supabase `app_config` o `/operaciones/trabajo` |
| **Mensual** | Variables Vercel | `BOT_*`, tags afiliado, `CRON_SECRET`, URLs largas sin rotar | Vercel → Environment |
| **Mensual** | Afiliados | Tag Amazon vigente; tag ML según panel ML (coincide con lo que espera `?tag=`) | Portales Associates + ML |
| **Mensual** | Enlaces de prueba | 1 oferta ML + 1 Amazon: `offer_url` con `tag=` correcto | Crear borrador / inspeccionar DB |
| **Trimestral** | Fuentes bot | `BOT_INGEST_URLS`, `BOT_INGEST_AMAZON_ASINS`, discover ML | `.env` / Vercel |
| **Trimestral** | Supabase | Límites plan, backups, RLS no relajado por error | Panel Supabase |
| **Trimestral** | Crons | `vercel.json` ↔ rutas `/api/cron/*` existentes y protegidas | Repo + Vercel Cron |
| **Trimestral** | Dependencias | `npm audit`, actualizar Next/patch críticos | Repo local / CI |
| **Anual o ante incidente** | Secretos | Rotar claves filtradas; `CRON_SECRET`, service role si hubo exposición | Vercel + Supabase |

Ajusta fechas a tu calendario (p. ej. “primer lunes del mes” = revisión mensual).

---

## 3. Prompts para IA (copiar y pegar)

Sustituye `[PEGAR AQUÍ]` por logs, capturas en texto, o lista de env (sin secretos completos).

### 3.1 Ronda mensual “estado del bot”

```text
Contexto: AVENTA, Next.js, bot ingest en Vercel, modo solo moderación.
Tengo esta configuración y fragmentos de log (sin secretos):

[PEGAR AQUÍ]

Preguntas:
1. ¿Hay señales de rate limit, HTML bloqueado, o demasiados duplicate?
2. ¿Qué variable BOT_INGEST_* ajustarías primero y por qué?
3. ¿Algo que deba escalar a desarrollo (código)?
```

### 3.2 Afiliados ML + Amazon

```text
Stack: AVENTA aplica tag con query param "tag" en URLs mercadolibre.* y amazon.*.

Panel ML dice: [PEGAR etiqueta / captura en texto]
Variables actuales (valores parciales o nombres solamente): [PEGAR]

¿Hay contradicción con lo que hace el código? ¿Qué comprobar en una URL real antes/después de guardar oferta?
```

### 3.3 Tras cambio de env en Vercel

```text
Cambié estas variables en Vercel: [LISTA DE NOMBRES, sin valores secretos]
Desplegué en producción.

Genera un checklist de smoke test en 5 pasos para validar bot + crear oferta + CTA "Ver oferta en tienda".
```

### 3.4 Seguridad / secretos (post-incidente)

```text
Hubo posible exposición de: [QUÉ]. Stack: Supabase + Vercel + Next.

Lista ordenada de rotación (qué rotar primero) y qué NO hace falta rotar.
```

---

## 4. Historial de revisiones (pega debajo cada ronda)

*Instrucciones:* copia un bloque **Completo** por revisión. Así acumulas trazabilidad sin otra herramienta.

```markdown
### YYYY-MM-DD — [Mensual | Trimestral | Ad hoc] — [tu nombre o iniciales]

- **Áreas tocadas:** (ej. Bot, Vercel env, ML tag, Amazon, Supabase, crons, npm audit)
- **Resultado:** OK / Ajustes hechos / Pendiente
- **Cambios concretos:** (ej. subí MIN_DISCOUNT a 25, quité 3 URLs rotas)
- **Pegar contexto / notas para IA:** (opcional: resumen de logs o decisión tomada)

---
```

**Ejemplo:**

```markdown
### 2026-03-30 — Mensual — YN

- **Áreas tocadas:** Bot, afiliados Amazon
- **Resultado:** OK
- **Cambios concretos:** Verifiqué tag Associates coincide con Vercel; probé una oferta Amazon nueva, `offer_url` lleva `tag=`.
- **Notas:** ML pendiente de confirmar tag en panel clásico vs perfil social.

---
```

---

## 5. Índice: qué en el proyecto **sí** requiere mantenimiento

| Componente | Por qué se desvía con el tiempo |
|------------|----------------------------------|
| **Variables `BOT_INGEST_*`** | Fuentes, límites, umbrales de calidad |
| **`app_config` / pausa bot** | Operación manual vs automatización |
| **Crons Vercel** | Cambios en rutas o secretos |
| **Afiliados (ML, Amazon)** | Reglas del programa, IDs, formato de enlaces |
| **`BOT_INGEST_URLS` / ASINs** | Productos descontinuados, enlaces 404 |
| **Supabase** | Plan, backups, políticas, índices |
| **Dependencias npm** | CVEs, compatibilidad Next |
| **Documentación** | Deriva respecto al código (`CONTEXTO_SISTEMA`, este archivo) |

---

*Enlace rápido desde modo bot: `docs/BOT_MODO_SOLO_MODERACION.md` §7.*
