# Checklist de funcionamiento (test manual desde cero)

Fecha: 27-03-2026  
Objetivo: validar AVENTA como lo haría una persona nueva (consumidor + creador), sin asumir que "debería" funcionar.

## Reglas del test

- Probar en modo incógnito y con cuenta nueva.
- Anotar evidencia (captura, hora, navegador, URL, resultado real).
- Si algo falla, registrar exactamente qué hiciste antes del fallo.
- No cerrar el bug sin reproducir en al menos 2 navegadores.

---

## 1) Flujo usuario consumidor (nuevo)

### 1.1 Primera visita

- [ ] Abrir home en limpio.
- [ ] Confirmar que carga sin errores visibles.
- [ ] Confirmar tabs principales: Día a día, Top, Para ti (si login), Recientes.
- [ ] En Día a día, confirmar chips: Todas, Ropa, Comida, Hogar, Belleza, Viajes, Servicios.

### 1.2 Feed y navegación

- [ ] Entrar a una oferta desde card.
- [ ] Regresar y abrir otra oferta.
- [ ] Validar que imágenes, precio y tienda se vean correctos.
- [ ] Validar que favicon/logo de pestaña se vea de AVENTA (no genérico).

### 1.3 Interacciones

- [ ] Votar positivo y negativo (con sesión).
- [ ] Guardar y quitar favorito.
- [ ] Compartir oferta.
- [ ] Confirmar que no aparecen errores 400/500 en consola para acciones básicas.

### 1.4 Percepción de confianza

- [ ] Ver que políticas (privacidad/términos) abren bien.
- [ ] Confirmar que footer y navegación legal son accesibles.

---

## 2) Flujo usuario creador (subir oferta)

### 2.1 Formulario base

- [ ] Abrir modal "Subir oferta".
- [ ] Pegar URL de tienda y esperar autocompletado.
- [ ] Validar que llena título/tienda y, si la página lo permite, precio.
- [ ] Cargar categoría y precios manualmente.

### 2.2 Fotos múltiples

- [ ] Subir 1 foto -> debe verse preview.
- [ ] Subir 2-3 fotos más -> deben aparecer todas en miniaturas.
- [ ] Cambiar portada tocando miniatura.
- [ ] Eliminar una miniatura intermedia.
- [ ] Publicar y confirmar que no aparece "Datos inválidos para crear la oferta".

### 2.3 Precio exacto

- [ ] Escribir precio con decimales (ej. 1999.99).
- [ ] Publicar.
- [ ] Revisar oferta publicada y confirmar que no fue redondeado incorrectamente.

### 2.4 Errores de validación

- [ ] Intentar publicar con campo obligatorio vacío.
- [ ] Confirmar que el mensaje de error sea claro.
- [ ] Corregir y publicar con éxito.

---

## 3) Flujo moderador/admin

### 3.1 Moderación

- [ ] Revisar cola pendiente.
- [ ] Aprobar una oferta.
- [ ] Rechazar una oferta de prueba.
- [ ] Confirmar que no se traba la interfaz.

### 3.2 Objetivos de catálogo

- [ ] Abrir sidebar de objetivos.
- [ ] Confirmar metas visibles: total, calidad y distribución por categoría.
- [ ] Cambiar entre 24h y 7 días.

### 3.3 Métricas

- [ ] Abrir `/admin/metrics`.
- [ ] Confirmar que aparece tarjeta "Crecimiento".
- [ ] Verificar que no rompe otras métricas existentes.

---

## 4) Flujo owner / operación

- [ ] Abrir `/operaciones`.
- [ ] Revisar semáforo Go/No-Go.
- [ ] Ejecutar integridad manual.
- [ ] Revisar backlog de cola de escrituras.
- [ ] Ejecutar "Procesar cola" y confirmar actualización.

---

## 5) Casos de borde (obligatorios)

- [ ] Pegar URL inválida al subir oferta.
- [ ] Subir imagen >2MB.
- [ ] Subir formato no permitido.
- [ ] Simular red lenta (throttle) y confirmar que UI no se rompe.
- [ ] Repetir en móvil (Android/iOS navegador).

---

## 6) Formato de reporte de hallazgos

Por cada bug:

1. Título corto
2. Ruta exacta
3. Pasos de reproducción (1,2,3)
4. Resultado esperado
5. Resultado actual
6. Evidencia (captura/video)
7. Severidad (Alta/Media/Baja)

---

## 7) Criterio de “listo para salir”

Se considera listo cuando:

- 0 bugs críticos abiertos,
- 0 errores bloqueantes al publicar oferta con fotos,
- objetivos/métricas/operaciones cargan sin fallos,
- flujo completo consumidor + creador validado por al menos 2 personas nuevas.

