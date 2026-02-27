# Hacer el repositorio privado en GitHub

Para que solo tú (y quien tú invites) pueda ver el código en GitHub:

1. Entra en **https://github.com/AventaOficial/aventa-new**
2. Arriba, pestaña **Settings**
3. Baja hasta la sección **Danger Zone**
4. Clic en **Change repository visibility**
5. Elige **Make private** y confirma

## ¿Conviene hacerlo privado?

**Hacerlo privado tiene sentido si:**
- No quieres que cualquiera pueda ver o clonar el código.
- Prefieres que solo tú y colaboradores tengan acceso.

**Qué implica el aviso de GitHub:**

- **"Las bifurcaciones actuales seguirán siendo públicas"**: Si alguien ya hizo un fork, su copia sigue siendo pública y deja de estar enlazada a tu repo. Si hoy no tienes forks, no afecta.
- **"La Seguridad Avanzada quedará desactivada"**: En repos **privados**, las alertas automáticas de Dependabot (vulnerabilidades en dependencias) solo están incluidas si tienes **GitHub Advanced Security** (de pago en cuentas gratuitas). Es decir: al pasar a privado pierdes las alertas gratuitas de Dependabot en ese repo.

**Recomendación:**

- Si tu prioridad es **ocultar el código** y no te importa dejar de tener Dependabot gratis en este repo → **hazlo privado**. Puedes seguir revisando dependencias con `npm audit` en local o en CI.
- Si quieres **mantener las alertas de seguridad gratis** y no te molesta que el código sea público → **déjalo público**. Las claves (Supabase, Upstash, etc.) no deben estar en el repo de todos modos; están en Vercel y en `.env.local`.

**Resumen:** Privado = más intimidad del código, menos alertas gratis. Público = código visible, Dependabot gratis. Tú eliges según qué prefieras priorizar.
