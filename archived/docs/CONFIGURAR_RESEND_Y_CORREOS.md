# Cómo configurar Resend y personalizar los correos

Guía para tener los correos diario y semanal funcionando con buen diseño y desde tu dominio.

---

## 1. Cuenta y API Key en Resend

1. **Crear cuenta:** Entra en [resend.com](https://resend.com) y regístrate (gratis; incluye envíos limitados al mes).
2. **API Key:**
   - En el dashboard ve a **API Keys** (o [resend.com/api-keys](https://resend.com/api-keys)).
   - Clic en **Create API Key**.
   - Nombre: p. ej. `aventa-production`.
   - Permiso: **Sending access** (solo envío).
   - Crea y **copia la clave** (solo se muestra una vez).
3. **En Vercel:** Proyecto `aventa-new` → **Settings** → **Environment Variables**:
   - `RESEND_API_KEY` = la clave que copiaste (Production y, si quieres, Preview).

---

## 2. Dominio (aventaofertas.com) para enviar desde tu correo

Para que el “De” sea algo como `AVENTA <notificaciones@aventaofertas.com>` y no `onboarding@resend.dev`:

1. En Resend: **Domains** → **Add Domain**.
2. Dominio: `aventaofertas.com` (o un subdominio como `notificaciones.aventaofertas.com`; Resend recomienda subdominio).
3. Resend te mostrará **registros DNS** (SPF y DKIM). Esos registros **no se ponen en Resend ni en el código**: se añaden en el sitio donde **gestionas el DNS de aventaofertas.com**.

### ¿Dónde se registran los DNS?

En el **mismo lugar donde configuraste el dominio** para que apunte a tu web (aventaofertas.com). Por ejemplo:

- **Cloudflare:** Dominio → DNS → Records → Add record (tipo TXT o MX; nombre y valor que te da Resend).
- **Namecheap, GoDaddy, Google Domains, etc.:** Entra en tu cuenta → tu dominio → sección **DNS** / **DNS Management** / **Advanced DNS** → añadir registro (TXT o MX según indique Resend).
- **Vercel (si el DNS está en Vercel):** Proyecto → Settings → Domains → el dominio → pestaña o enlace a **DNS** y ahí añades los registros. Si Resend pone TTL "Auto" y Vercel no lo acepta, usa **60** (o 3600); la verificación solo depende del nombre y del contenido del registro.

### Qué registros añadir (todos en el mismo DNS)

Además del **DKIM** (TXT `resend._domainkey` con el valor largo que te da Resend), hay que añadir los de **SPF** para habilitar el envío:

| Tipo | Nombre | Contenido / Valor | TTL | Prioridad (solo MX) |
|------|--------|-------------------|-----|---------------------|
| MX   | send   | feedback-smtp.us-east-1.amazonses.com | 60 | 10 |
| TXT  | send   | v=spf1 include:amazonses.com ~all      | 60 | — |

El **DMARC** es opcional pero mejora que los correos lleguen a la bandeja de entrada: TXT nombre `_dmarc`, valor `v=DMARC1; p=none;`, TTL 60.

4. Crea todos esos registros en tu DNS. Espera unos minutos y en Resend pulsa **Verify** (o **Verify DNS Records**). Cuando el estado del dominio sea **Verified**, sigue abajo.
5. **Variable en Vercel:**  
   `EMAIL_FROM` = el remitente que quieras, por ejemplo:
   - `AVENTA <notificaciones@aventaofertas.com>`

Si usas subdominio (p. ej. `notificaciones.aventaofertas.com`), el formato sería:
`AVENTA <aventa@notificaciones.aventaofertas.com>` (y en Resend añades el dominio `notificaciones.aventaofertas.com`).

### Qué sigue cuando el dominio está listo

1. **En Resend:** Confirma que el dominio muestre estado **Verified**. Si no, pulsa de nuevo **Verify**.
2. **En Vercel:** Añade la variable `EMAIL_FROM` = `AVENTA <notificaciones@aventaofertas.com>` (Settings → Environment Variables). Ya deberías tener `RESEND_API_KEY`.
3. **Probar:** Entra con un usuario que tenga activado “Resumen diario” en Configuración y abre en el navegador:  
   `https://aventaofertas.com/api/cron/daily-digest?secret=TU_CRON_SECRET`  
   Ese usuario debería recibir el correo del Top 10. Los crons de Vercel ya disparan solos a las 18:00 México (diario y semanal).

---

## 3. Variables en Vercel (resumen)

| Variable        | Dónde se obtiene                         | Ejemplo |
|----------------|------------------------------------------|---------|
| `RESEND_API_KEY` | Resend → API Keys → Create API Key       | `re_xxxx...` |
| `EMAIL_FROM`     | Tras verificar el dominio en Resend      | `AVENTA <notificaciones@aventaofertas.com>` |
| `EMAIL_LOGO_URL` | Opcional. URL pública del logo (cabecera del correo) | `https://aventaofertas.com/logo-email.png` |

Para que Gmail muestre identidad visual: sube una imagen (ej. `logo-email.png`, ~120×40 px o similar) a tu sitio (carpeta `public/`) y pon su URL en `EMAIL_LOGO_URL`. Así la cabecera del correo lleva logo + texto AVENTA.

Opcional: `NEXT_PUBLIC_APP_URL` = `https://aventaofertas.com` (ya lo usarás para enlaces en los correos).

---

## 4. Diseño y estructura de los correos

Los correos usan una plantilla común (en código):

- **Cabecera:** logo/marca AVENTA.
- **Título:** “Top 10 del día” o “Resumen de la semana”.
- **Cuerpo:** bloques claros (tabla o tarjetas por oferta: título, tienda, precio, enlace).
- **Botón principal:** “Ver ofertas en AVENTA” que lleva a la web.
- **Pie:** enlace a preferencias (“Gestionar notificaciones” → `/settings`) para activar/desactivar diario o semanal.

Todo el HTML se genera en el proyecto (plantilla base en `lib/email/templates.ts` y uso en las rutas cron). Si quieres cambiar colores, tipografía o textos, se hace ahí; no hace falta configurar nada en Resend más allá del dominio y la API key.

---

## 5. Probar sin esperar al cron

Puedes llamar a las rutas con tu `CRON_SECRET` para comprobar que se envían correos:

- Diario:  
  `https://aventaofertas.com/api/cron/daily-digest?secret=TU_CRON_SECRET`
- Semanal:  
  `https://aventaofertas.com/api/cron/weekly-digest?secret=TU_CRON_SECRET`

(Reemplaza `TU_CRON_SECRET` por el valor que tienes en Vercel.)  
Solo recibirán correo los usuarios que tengan activado el diario o el semanal en Configuración.

---

## 6. Sobre el código de la API de Resend (dominios)

Los ejemplos que muestra Resend (`resend.domains.create`, `resend.domains.verify`, etc.) son para **gestionar dominios desde código**. No hace falta añadirlos al proyecto: el dominio ya lo añadiste en el dashboard y la verificación se hace pulsando **Verify** ahí. El envío de correos lo hacemos con `fetch` a `api.resend.com/emails`; no hace falta instalar el paquete `resend` ni usar esa API de dominios.

---

## 7. Si al abrir la URL del cron “no sale nada”

- **¿Qué deberías ver?** Al abrir la URL en el navegador deberías ver **JSON**, por ejemplo:  
  `{"ok":true,"sent":1,"recipients":1}` o `{"ok":true,"sent":0,"message":"No recipients"}`.

- **Página en blanco o 404:** Es posible que en producción aún no esté desplegada la ruta del cron. Haz **git push** de los últimos cambios y espera a que Vercel termine el deploy. Luego vuelve a abrir la URL.

- **Ves `{"ok":true,"sent":0}` o `"No recipients"`:**
  1. Entra en la app con tu usuario → **Configuración** → activa **“Resumen diario”** y guarda (así se guarda tu email en preferencias).
  2. Comprueba en Vercel que existan **RESEND_API_KEY** y **EMAIL_FROM** (y que el dominio esté Verified en Resend).
  3. Vuelve a llamar a la URL del cron; deberías recibir el correo en la bandeja del usuario con el que activaste el resumen.

- **401 Unauthorized:** El `secret` de la URL debe ser exactamente el valor de **CRON_SECRET** en Vercel (sin espacios).
