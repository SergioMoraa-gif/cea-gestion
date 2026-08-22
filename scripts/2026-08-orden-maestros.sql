-- ================================================================
-- Agrega el campo "orden" a Maestros para poder reordenar las
-- columnas del Calendario Global manualmente (drag/flechas en el UI).
-- CEA Sistema de Gestión — correr en Supabase Dashboard > SQL Editor
--
-- No borra ni modifica ninguna fila existente más que rellenar este
-- nuevo campo: se inicializa con el orden alfabético actual (el mismo
-- que ya se ve hoy en el calendario) para que nada se mueva de lugar
-- la primera vez que se despliegue este cambio.
-- ================================================================

ALTER TABLE "Maestros" ADD COLUMN IF NOT EXISTS orden INTEGER;

WITH numerados AS (
  SELECT id_maestro, ROW_NUMBER() OVER (ORDER BY nombre ASC) - 1 AS pos
  FROM "Maestros"
)
UPDATE "Maestros" m
SET orden = numerados.pos
FROM numerados
WHERE m.id_maestro = numerados.id_maestro
  AND m.orden IS NULL;
