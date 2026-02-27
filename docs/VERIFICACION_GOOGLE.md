# Verificación en Google Cloud (OAuth y dominio)

## 1. Enlace a Política de Privacidad en la página principal

La página principal (`https://aventaofertas.com`) incluye en el **pie de página** (footer) enlaces a:

- **Política de Privacidad:** https://aventaofertas.com/privacy  
- **Términos y Condiciones:** https://aventaofertas.com/terms  

Ese footer se muestra en todas las páginas y está en el HTML desde el primer carga, para que los verificadores de Google puedan verlo.

## 2. Página principal sin “acceso restringido”

Para que Google no considere la home como “protegida por una página de acceso”:

- Cuando el visitante es un **bot** (Googlebot, Bingbot, etc.), la app no muestra el onboarding ni la pantalla de carga: se muestra directamente el contenido principal (feed de ofertas) y el footer con los enlaces legales.
- Los usuarios normales siguen viendo el onboarding la primera vez y luego el feed.

Así el verificador de Google puede ver la home con contenido público y los enlaces a privacidad y términos.

## 3. Verificar que el sitio “está registrado a tu nombre”

El mensaje **“El sitio web de la URL de tu página principal no está registrado a tu nombre”** se resuelve **verificando la propiedad del dominio** en Google. No se soluciona con código.

### Pasos recomendados

1. Entra en **Google Search Console**: https://search.google.com/search-console  
2. Añade una **propiedad** con tu dominio: `https://aventaofertas.com`  
3. **Verifica la propiedad** con uno de los métodos que ofrece Google:
   - **Registro DNS (recomendado):** Añade un registro TXT en el DNS de tu dominio (en Vercel: Domains → tu dominio → DNS) con el valor que te indique Search Console.
   - **Archivo HTML:** Descarga el archivo que te da Google y súbelo a la raíz de tu sitio (por ejemplo en `public/`) y despliega.
   - **Meta tag en HTML:** Si prefieres, añade la etiqueta que te da Google en el `<head>` de tu layout.
4. Cuando Search Console marque el dominio como **Verificado**, la propiedad del sitio quedará acreditada para Google (incluido el uso en la pantalla de consentimiento de OAuth).

Después de verificar en Search Console, vuelve a solicitar la **verificación de la app** en Google Cloud (OAuth consent screen). A veces los cambios tardan unos minutos u horas en reflejarse.

---

## Checklist detallado — Consola de Google Cloud (OAuth)

Usar esta lista en **APIs y servicios** de Google Cloud para el proyecto AVENTA.

### Pantalla de consentimiento de OAuth

- [ ] **Nombre de la aplicación**: Claro y acorde a la marca (ej. "AVENTA Ofertas").
- [ ] **Correo de asistencia**: aventaoficial@gmail.com (o el que uses).
- [ ] **Logotipo**: Cuadrado 120×120 px, &lt; 1 MB.
- [ ] **Página principal**: `https://aventaofertas.com`
- [ ] **Política de Privacidad**: `https://aventaofertas.com/privacy`
- [ ] **Condiciones del servicio**: `https://aventaofertas.com/terms`
- [ ] **Dominios autorizados**: Incluir `aventaofertas.com` y, si aplica, el dominio de callback de Supabase (p. ej. `*.supabase.co` según doc de Supabase).
- [ ] **Información de contacto del desarrollador**: Correo para notificaciones.

### Credenciales OAuth (ID de cliente web)

- [ ] **Orígenes JavaScript autorizados**: `https://aventaofertas.com` y, si Supabase hace peticiones desde su dominio, el origen correspondiente.
- [ ] **URI de redirección autorizados**: La URL de callback de Supabase para Google **exactamente igual** que en Supabase (ej. `https://<proyecto>.supabase.co/auth/v1/callback`). Sin barra final de más o de menos, sin http en lugar de https.

### Verificación y política de privacidad

- [ ] **Caché / re-escaneo**: Si Google sigue diciendo que no ve el enlace a privacidad, pedir indexación en Search Console y esperar o reenviar la verificación.
- [ ] **Googlebot**: Usar "Probar URL publicada" en Search Console para ver la captura que ve Googlebot; comprobar que el footer con /privacy y /terms es visible y que los enlaces son `<a href="...">` (no solo JavaScript).
- [ ] **Enlace más visible**: Si sigue fallando, añadir un enlace a /privacy en navbar o hero y volver a solicitar verificación.
- [ ] **Captura de pantalla**: Tener una captura de la home donde se vea claramente el enlace a la Política de Privacidad (footer u otro).

### Ámbitos (scopes)

- [ ] Solo los mínimos: `email`, `profile`, `openid` para login básico. Quitar cualquier scope no usado (Drive, Calendar, etc.).

### Antes de enviar a verificación

- [ ] **Estado de publicación**: En "Prueba", probar con usuarios de prueba.
- [ ] **Login con Google**: Funciona en producción sin errores.
- [ ] **Instrucciones o credenciales de prueba**: Si hay flujos restringidos, preparar instrucciones o una cuenta de prueba para los revisores.
- [ ] **Vídeo (si lo piden)**: Mostrar inicio de sesión con Google y uso del perfil en la app.

### Errores frecuentes

- Olvidar `https://`, usar `www` cuando el sitio es sin `www` (o al revés), o barra final incorrecta en URIs de redirección.
- Copiar/pegar las URLs desde Supabase y desde el navegador para evitar typos.

---

## Resumen

| Problema que mostraba Google | Qué se hizo / qué hacer |
|------------------------------|-------------------------|
| No hay vínculo a la política de privacidad | Footer en el layout con enlaces a `/privacy` y `/terms`. Si sigue fallando, enlace adicional en navbar o hero. |
| La página principal está protegida por acceso | Los bots ven la home pública (feed + footer) sin onboarding. |
| El sitio no está registrado a tu nombre | Verificar el dominio en Google Search Console (DNS, archivo o meta tag). |
| OAuth / consent screen | Revisar checklist anterior en APIs y servicios → Pantalla de consentimiento y Credenciales. |