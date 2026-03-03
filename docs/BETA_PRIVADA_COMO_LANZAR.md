# Cómo lanzar la beta privada (“destrucción controlada”)

Objetivo: probar con ~20 usuarios sin que todos entren a la vez, recoger feedback y datos sin romper la experiencia.

---

## 1. Antes de invitar

- [ ] Checklist técnica hecha (auth, ofertas, correos, métricas producto).
- [ ] 15–25 ofertas semilla de calidad subidas.
- [ ] **Métrica norte:** % retención 48h (ya visible en Admin → Métricas). Umbrales con ~20 usuarios: 3/20 (15%) = problema; 10/20 (50%) = interesante; 15/20 (75%) = señal fuerte.
- [ ] Preguntas para beta testers listas (ver `PREGUNTAS_BETA_TESTERS.md`).
- [ ] **No comunicar economía** en la beta (primero comportamiento natural; incentivos después). Incluir **2–3 líderes** de los ~20 para observar (¿suben sin presión?, ¿intentan dominar ranking?), no 10.

---

## 2. Cómo meter a los 20 sin saturar

- **Oleadas:** Invitar en 2–3 grupos (ej. 7 + 7 + 6) con 2–3 días entre grupos. Así no todos llegan el mismo día y puedes ver logs y errores por tandas.
- **Canal:** Un solo lugar (WhatsApp, Telegram o correo) donde explicas: “Es beta, queremos que la rompan; pueden reportar bugs o cosas raras aquí.”
- **Mensaje tipo:** “Estamos probando algo nuevo. Necesitamos que lo usen y nos digan qué falla o qué no se entiende. No es versión final.”
- **Instrucción mínima:** “Entren, miren ofertas, si quieren suban una o voten. Al final les haremos unas preguntas cortas.”

---

## 3. “Destrucción controlada”

- **Qué significa:** Que prueben flujos reales (registro, subir oferta, votar, correo, notificaciones) y que tú priorices **encontrar fallos y fricciones**, no que todo salga perfecto.
- **Qué hacer:** Revisar logs (Vercel, Supabase) tras cada oleada; anotar errores y pantallas donde se atascan; después de 1–2 semanas, enviar el cuestionario de preguntas (o llamada corta) a quienes usaron algo.
- **Métrica norte:** Revisar en Admin → Métricas de producto la **Retención 48h** (marcada como métrica norte). Interpretar: &lt;15% problema, 50% interesante, ≥75% señal fuerte. Otras útiles para contexto: activos 24h, nuevos por día, % que sube ≥1 oferta, % que vota ≥3 veces.

---

## 4. Después de la beta

- Priorizar arreglos según: (1) bugs que impiden usar, (2) confusión que repiten varios, (3) “qué tendría que pasar para que lo uses seguido”.
- Si la mayoría dice “entraría diario si hubiera ofertas buenas cada día” → enfocarse en contenido y correo. Si dicen “no sé para qué volver” → reforzar motivo de regreso (ver `MOTIVOS_DE_REGRESO_Y_RETENCION.md`).
