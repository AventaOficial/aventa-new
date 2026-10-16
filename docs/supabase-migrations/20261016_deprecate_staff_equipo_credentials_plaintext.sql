-- Opcional (fase pruebas): si se creó staff_equipo_credentials con contraseñas en texto plano,
-- dejar de usarla en aplicación. No borrar datos sin backup; esta migración solo documenta deprecación.
-- La app muestra contraseñas temporales una sola vez al generarlas (Supabase Auth).

COMMENT ON TABLE public.staff_equipo_credentials IS
  'DEPRECADO: no escribir contraseñas en texto plano. Usar generación one-shot vía admin API.';
