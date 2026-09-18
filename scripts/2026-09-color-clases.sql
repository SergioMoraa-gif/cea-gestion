-- ================================================================
-- Agrega color_fondo y color_letra a HorariosAlumnos para poder
-- personalizar el color de cada clase/bloque de forma independiente
-- del maestro (Calendario Global > editar bloque / asignar clase).
-- CEA Sistema de Gestión — correr en Supabase Dashboard > SQL Editor
--
-- No borra ni modifica ninguna fila existente: ambas columnas quedan
-- en NULL para todo lo que ya existe, lo que el front-end interpreta
-- como "color por defecto" (gris neutro) — nada cambia visualmente
-- hasta que alguien elija un color a propósito.
--
-- Nota: Postgres no soporta "ADD CONSTRAINT IF NOT EXISTS" (a
-- diferencia de "ADD COLUMN IF NOT EXISTS"), por eso los CHECK se
-- agregan dentro de un bloque DO que ignora el error si ya existen
-- — así el script se puede volver a correr sin problema.
-- ================================================================

ALTER TABLE "HorariosAlumnos" ADD COLUMN IF NOT EXISTS color_fondo TEXT;
ALTER TABLE "HorariosAlumnos" ADD COLUMN IF NOT EXISTS color_letra TEXT;

DO $$
BEGIN
  ALTER TABLE "HorariosAlumnos"
    ADD CONSTRAINT chk_color_fondo
    CHECK (color_fondo IS NULL OR color_fondo IN ('azul','rosa','amarillo','verde'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "HorariosAlumnos"
    ADD CONSTRAINT chk_color_letra
    CHECK (color_letra IS NULL OR color_letra IN ('azul','rosa','amarillo','verde'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
