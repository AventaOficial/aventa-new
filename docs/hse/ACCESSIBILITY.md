# HSE Accessibility Checklist

**Protocolo:** HSE-00  
**Uso:** auditoría y reportes; no implica cambios de producción en esta fase.  
**Severidad sugerida:** Blocker · Major · Minor · Note

Cada ítem al fallar debe ligarse a TASK-* / USER-* cuando sea posible (p. ej. USER-G, USER-H, TASK-014/015).

---

## 1. Teclado

- [ ] Todo el happy path de tareas críticas operable solo con teclado  
- [ ] Orden de tab lógico  
- [ ] No hay trampas de foco  
- [ ] Esc cierra modales/dialogs cuando aplica  
- [ ] Atajos no rompen lectores de pantalla  

## 2. Focus

- [ ] Indicador de foco visible  
- [ ] Foco se mueve a contenido nuevo relevante (modal, ruta) de forma predecible  
- [ ] Tras cerrar modal, foco vuelve a un lugar sensato  

## 3. Contraste

- [ ] Texto principal con contraste adecuado  
- [ ] Texto secundario/metadatos legible  
- [ ] Estados (voto, favorito, error) no solo por color  

## 4. Tamaño de objetivos

- [ ] Targets táctiles suficientes en móvil (USER-H)  
- [ ] Espaciado evita mis-taps  
- [ ] Icon-only controls tienen nombre accesible  

## 5. Lectura y jerarquía

- [ ] Jerarquía de headings coherente en detalle  
- [ ] Precio y CTA localizables sin depender solo de posición visual  
- [ ] Densidad no impide escaneo (hipótesis a medir)  

## 6. Semántica

- [ ] Botones vs links correctos  
- [ ] Listas/cards con roles adecuados  
- [ ] Imágenes con alternativa o marcadas decorativas  

## 7. Screen readers

- [ ] Nombre, rol, valor en controles clave (voto, favorito, CTA)  
- [ ] Mensajes de error anunciables  
- [ ] Live regions solo cuando necesario  

## 8. Navegación móvil

- [ ] Zoom/reflow no rompe tareas  
- [ ] Controles no oscurecidos por UI del sistema  
- [ ] Gestos no son el único medio  

## 9. Baja precisión motora

- [ ] Objetivos grandes / espaciados  
- [ ] Acciones destructivas o irreversibles requieren confirmación clara  
- [ ] Doble-tap no corrompe estado (favorito/voto)  

## 10. Dificultades cognitivas

- [ ] Lenguaje claro en errores y estados (pending/rejected)  
- [ ] Feedback de éxito/fracaso explícito  
- [ ] Evitar dependencia de memoria para TASK-005/012 cuando sea posible (reconocimiento)  
- [ ] No urgencia engañosa  

---

## Registro de hallazgo a11y

```text
id:
criterion:
severity: Blocker | Major | Minor | Note
task_id:
user_model_id:
evidence: E*
label: SIMULATED | OBSERVED
repro_steps:
impact:
status: open
```

---

## Relación con fricción

Un **Blocker** a11y en el camino de la tarea ⇒ fricción **F4** (o F5 si la tarea es imposible para ese usuario).
