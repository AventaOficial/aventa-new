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

## Resumen

| Problema que mostraba Google | Qué se hizo / qué hacer |
|------------------------------|-------------------------|
| No hay vínculo a la política de privacidad | Footer en el layout con enlaces a `/privacy` y `/terms`. |
| La página principal está protegida por acceso | Los bots ven la home pública (feed + footer) sin onboarding. |
| El sitio no está registrado a tu nombre | Verificar el dominio en Google Search Console (DNS, archivo o meta tag). |
