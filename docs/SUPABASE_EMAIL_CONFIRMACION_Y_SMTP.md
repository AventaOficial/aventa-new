# Confirmación de correo y SMTP en Supabase

## Confirmación de correo (ya activada)

En **Supabase → Authentication → Providers → Email** activaste **"Confirmar correo electrónico"**: los usuarios deben confirmar su dirección antes de iniciar sesión por primera vez (o, según configuración, tienen sesión pero la app los trata como "pendientes" hasta que confirmen).

### En la app

- **Pantalla "Confirmar inscripción"**: cuando el usuario se registra y Supabase indica que debe confirmar el correo (p. ej. no devuelve sesión hasta que confirmen), se muestra un modal con:
  - Título: **Confirmar inscripción**
  - Texto: *Revisa tu correo. Te enviamos un enlace para activar tu cuenta. Haz clic en el enlace del correo para continuar.*
  - Botón "Entendido" para cerrar.
- Si Supabase devuelve sesión pero con `email_confirmed_at` null, el **UIProvider** muestra la misma pantalla mientras `isPending` sea true (session existe pero correo no confirmado).

---

## Plantilla del correo de confirmación (Supabase)

En **Authentication → Email Templates** está la plantilla **"Confirm Your Signup"**. El código que mencionas es el estándar de GoTrue; la variable `{{ .ConfirmationURL }}` es la correcta y debe mantenerse.

Ejemplo en español (puedes pegarlo en la plantilla):

**Asunto (Subject):** `Confirma tu inscripción en AVENTA`

**Cuerpo (Body):**
```html
<h2>Confirma tu inscripción</h2>
<p>Hola,</p>
<p>Para activar tu cuenta en AVENTA, haz clic en el siguiente enlace:</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar mi correo</a></p>
<p>Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
```

No quites `{{ .ConfirmationURL }}`: es el enlace que Supabase genera para confirmar. Otras variables útiles en plantillas: `{{ .Email }}`, `{{ .SiteURL }}` (ver [docs Supabase](https://supabase.com/docs/guides/auth/auth-email-templates)).

---

## SMTP: ¿hace falta? ¿Resend?

**Correos integrados de Supabase:** El servicio de correo integrado tiene **límites de envío** y no está pensado para producción con mucho tráfico. Para desarrollo o beta con pocos usuarios suele bastar.

**Configurar SMTP en Supabase:**  
En **Authentication → SMTP** puedes configurar un servidor SMTP propio (p. ej. Resend, SendGrid, Postmark). Eso afecta **solo a los correos que envía Supabase Auth**: confirmación de inscripción, restablecer contraseña, magic link, etc. No afecta a los correos que envíe tu app desde Vercel (p. ej. si tienes una API route que use Resend para newsletters). 

**Resend:**  
- Para que los correos de **Supabase** (confirmación, reset) salgan por Resend: en Supabase configuras SMTP con las credenciales SMTP de Resend (Resend ofrece SMTP además de su API).  
- Para correos que envía **tu app en Vercel** (p. ej. con el SDK de Resend): eso es independiente; no se configura en Supabase.

**Vercel** no envía los correos de Supabase. Quien envía el "Confirm your signup" es Supabase; por eso, si quieres más cuota o tu propio dominio/remitente para esos correos, configuras SMTP en **Supabase**, no en Vercel.

**Resumen:**  
- Beta / pocos usuarios: el correo integrado de Supabase suele ser suficiente.  
- Producción o más volumen: configurar SMTP en Supabase (p. ej. Resend vía SMTP) para los correos de autenticación.

---

## Cómo configurar Resend como SMTP en Supabase

En **Supabase → Authentication → SMTP** usa estos valores (los de Resend son para **SMTP**, no la API):

| Campo en Supabase        | Valor correcto |
|--------------------------|----------------|
| **Sender email address** | Un correo que tengas verificado en Resend (ej. `onboarding@tudominio.com` o `noreply@tudominio.com`). **No** pongas `smtp.resend.com` (eso es el host). |
| **Sender name**          | Ej. `AVENTA` o `Equipo AVENTA`. |
| **Host**                 | `smtp.resend.com` (hostname completo, no solo "resend"). |
| **Port**                 | `465` (TLS). |
| **Username**             | `resend` (literal, tal como indica la doc de Resend SMTP). |
| **Password**             | Tu **API Key** de Resend (la que empieza por `re_...`), desde Resend → API Keys. Es la que Resend llama "YOUR_API_KEY" en la doc de SMTP. |

**Errores frecuentes:**  
- Poner `smtp.resend.com` en "Sender email address" → ese campo debe ser un **email** (ej. `noreply@tudominio.com`), no el host.  
- Poner "Aventa-Clean" u otro nombre en Username → el usuario SMTP de Resend es siempre `resend`.  
- Poner una contraseña cualquiera en Password → hay que usar la **API Key** de Resend como contraseña SMTP.
