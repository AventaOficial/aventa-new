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

Para que Vercel acepte la petición, hay que añadir **tu secreto al final**, así:

```text
https://aventaofertas.com/api/cron/bot-ingest?secret=AQUI_PEGAS_TU_CRON_SECRET
```

**Importante:** sin espacios. Donde dice `AQUI_PEGAS_TU_CRON_SECRET` va **exactamente** el mismo texto que pusiste en Vercel como `CRON_SECRET`.

Si tu secreto tiene símbolos raros (`&`, `#`, `%`, etc.), a veces la web del cron “rompe” la URL. En ese caso prueba **solo letras y números** en un `CRON_SECRET` nuevo en Vercel y vuelve a desplegar.

---

## Paso 3: Crear el trabajo en cron-job.org

1. Entra a **[cron-job.org](https://cron-job.org)** y crea cuenta (o inicia sesión).
2. Menú **Cronjobs** → **Create cronjob**.
3. **Title:** por ejemplo `Aventa bot ofertas`.
4. **Address (URL):** pega la URL completa del paso 2 (con `?secret=...`).
5. **Schedule:** elige algo como **Every 15 minutes** (cada 15 minutos), o el intervalo que quieras.
6. **Request method:** debe ser **GET** (es lo normal por defecto).
7. Guarda el trabajo.

Listo: cada 15 minutos (o lo que hayas puesto) ese servicio llamará a tu sitio y se ejecutará una corrida del bot (respetando límites y configuración que tengas en variables de entorno).

---

## Cómo saber si falló

- En cron-job.org suele verse el **historial** de ejecuciones y si la respuesta fue **200** (bien) o **401** (mal: secreto no coincide o falta).
- **401** casi siempre = el `secret` en la URL no es igual al `CRON_SECRET` de Vercel, o falta el `?secret=...`.

---

## Si no quieres cron externo

En el panel de admin, **Operaciones / Trabajo → «Ejecutar ahora»** hace lo mismo a mano cuando tú quieras.

---

## Detalle técnico (opcional)

El mismo secreto también vale por cabecera (`Authorization: Bearer …` o `x-cron-secret`), pero en cron-job.org lo más simple suele ser la URL con `?secret=`. El código que lo comprueba está en `lib/server/cronAuth.ts`.
