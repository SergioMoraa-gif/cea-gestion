-- ================================================================
-- Evita cargos de inscripción duplicados por alumno.
-- CEA Sistema de Gestión — correr en Supabase Dashboard > SQL Editor
--
-- Mismo patrón que scripts/2026-08-unique-cargo-mensual.sql. Es un índice
-- PARCIAL: solo aplica a tipo = 'inscripcion'. No borra ni modifica ninguna
-- fila existente — solo agrega una regla para futuros inserts.
--
-- Antes de correrlo: revisa que no haya ya inscripciones duplicadas con
--   SELECT id_estudiante, COUNT(*) FROM "Pagos"
--   WHERE tipo = 'inscripcion' GROUP BY id_estudiante HAVING COUNT(*) > 1;
-- Si aparece alguna fila, hay que decidir cuál de las duplicadas conservar
-- antes de crear el índice (si no, la creación falla con un error claro).
-- ================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_pagos_inscripcion_unico
ON "Pagos" (id_estudiante)
WHERE tipo = 'inscripcion';
