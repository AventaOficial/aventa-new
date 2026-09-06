# Cron externo del bot (aventaofertas.com)

## Qué es esto, en pocas palabras

Tu sitio tiene una **dirección web** que, cuando alguien la abre con la **contraseña correcta**, hace correr el bot de ofertas una vez.

**Vercel Hobby** no deja programar “cada 15 minutos” desde el propio Vercel. Por eso usas un servicio gratis como **[cron-job.org](https://cron-job.org)**: es un **despertador** que, cada X minutos, **visita esa URL** por ti. Así el bot se ejecuta solo.

---

## Paso 1: La contraseña (`CRON_SECRET`)

1. Entra a **[vercel.com](https://vercel.com)** → tu proyecto de Aventa.
2. **Settings** → **Environment Variables**.
3. Busca la variable **`CRON_SECRET`**.
   - Si **no existe**, créala: un texto largo y aleatorio (puedes generar uno en cualquier generador de contraseñas). **Guárdala en Production** (y Preview si quieres).
   - Si **ya existe**, cópiala (o créala nueva y vuelve a desplegar si la cambias).

Ese valor **no** lo subas a GitHub ni lo compartas en público. Solo lo pegarás en Vercel y en cron-job.org.

---

## Paso 2: La URL exacta de tu sitio

Tu dominio es **aventaofertas.com**. La ruta del bot es siempre la misma:

```text
https://aventaofertas.com/api/cron/bot-ingest
```

**No** pongas el secreto en la URL (`?secret=…`). Los query secrets se rechazan (401).

Autentica solo con cabecera:

- `Authorization: Bearer AQUI_PEGAS_TU_CRON_SECRET`
- o `x-cron-secret: AQUI_PEGAS_TU_CRON_SECRET`

Donde dice `AQUI_PEGAS_TU_CRON_SECRET` va **exactamente** el mismo texto que pusiste en Vercel como `CRON_SECRET`.

---

## Paso 3: Crear el trabajo en cron-job.org

1. Entra a **[cron-job.org](https://cron-job.org)** y crea cuenta (o inicia sesión).
2. Menú **Cronjobs** → **Create cronjob**.
3. **Title:** por ejemplo `Aventa bot ofertas`.
4. **Address (URL):** `https://aventaofertas.com/api/cron/bot-ingest` (**sin** query secret).
5. En **Request headers** (o “Custom headers”), añade una de estas:
   - Name: `Authorization` · Value: `Bearer AQUI_PEGAS_TU_CRON_SECRET`
   - o Name: `x-cron-secret` · Value: `AQUI_PEGAS_TU_CRON_SECRET`
6. **Schedule:** elige algo como **Every 15 minutes** (cada 15 minutos), o el intervalo que quieras.
7. **Request method:** debe ser **GET** (es lo normal por defecto).
8. Guarda el trabajo.

Listo: cada 15 minutos (o lo que hayas puesto) ese servicio llamará a tu sitio y se ejecutará una corrida del bot (respetando límites y configuración que tengas en variables de entorno).

---

## Cómo saber si falló

- La ruta del cron responde **202 Accepted** enseguida y la ingesta sigue en **segundo plano** en Vercel (así cron-job.org no marca *timeout* a los ~30s). Eso cuenta como éxito (código 2xx).
- En cron-job.org el **historial** muestra el código HTTP; **401** = secreto mal, falta, o intentaste pasarlo por query.
- Para ver cuántas ofertas metió cada corrida: **Vercel → proyecto → Logs** y busca `[bot-ingest:after]` (línea JSON con `inserted`, `runMode`, etc.).

---

## Si no quieres cron externo

En el panel de admin, **Operaciones / Trabajo → «Ejecutar ahora»** hace lo mismo a mano cuando tú quieras.

---

## Detalle técnico (opcional)

Solo se aceptan cabeceras (`Authorization: Bearer …` o `x-cron-secret`). Vercel Cron envía `Authorization: Bearer CRON_SECRET` automáticamente. El código está en `lib/server/cronAuth.ts`.
