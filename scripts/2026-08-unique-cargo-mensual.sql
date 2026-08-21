-- ================================================================
-- Evita cargos mensuales duplicados por alumno + mes.
-- CEA Sistema de Gestión — correr en Supabase Dashboard > SQL Editor
--
-- Es un índice PARCIAL: solo aplica a tipo = 'mensual', así que NO
-- limita los pagos de tipo 'ajuste' ni 'inscripcion' (que sí pueden
-- repetirse legítimamente). No borra ni modifica ninguna fila
-- existente — solo agrega una regla para futuros inserts.
--
-- Verificado antes de escribir esto: 0 duplicados existentes en la
-- combinación (id_estudiante, mes) para tipo='mensual', así que el
-- índice se puede crear sin conflictos.
-- ================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_mensual_unico
ON "Pagos" (id_estudiante, mes)
WHERE tipo = 'mensual';
