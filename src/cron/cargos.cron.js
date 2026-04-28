// ================================
// cargos.cron.js — Generación automática de cargos mensuales
// CEA Sistema de Gestión
// ================================

const cron     = require('node-cron')
const supabase = require('../config/db')

// ─── Lógica principal ───────────────────────────────────────────────────────

/**
 * Genera cargos mensuales en estado "pendiente" para todos los alumnos activos.
 * Si el cargo del mes ya existe para un alumno, lo omite (no duplica).
 */
async function generarCargosMensuales() {
  const hoy = new Date()
  const mes  = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`

  console.log(`\n📋 Generando cargos automáticos para ${mes}...`)

  try {
    // 1. Obtener todos los alumnos activos
    const { data: estudiantes, error: errEst } = await supabase
      .from('Estudiantes')
      .select('id_estudiante, precio_mensual')
      .eq('activo', true)

    if (errEst)  throw new Error(errEst.message)
    if (!estudiantes || estudiantes.length === 0) {
      console.log('ℹ️  Sin alumnos activos. No se generaron cargos.')
      return
    }

    // 2. Verificar qué cargos mensuales ya existen para este mes
    const { data: existentes } = await supabase
      .from('Pagos')
      .select('id_estudiante')
      .eq('mes', mes)
      .eq('tipo', 'mensual')

    const idsExistentes = new Set((existentes || []).map(p => p.id_estudiante))

    // 3. Crear solo los cargos que faltan
    const nuevos = estudiantes
      .filter(e => !idsExistentes.has(e.id_estudiante))
      .map(e => ({
        id_estudiante: e.id_estudiante,
        mes,
        monto:  e.precio_mensual || 0,
        estado: 'pendiente',
        tipo:   'mensual'
      }))

    if (nuevos.length === 0) {
      console.log('ℹ️  Todos los cargos del mes ya existían. Nada que generar.')
      return
    }

    const { error: errInsert } = await supabase.from('Pagos').insert(nuevos)
    if (errInsert) throw new Error(errInsert.message)

    console.log(`✅ ${nuevos.length} cargo(s) generado(s) correctamente para ${mes}.`)
  } catch (err) {
    console.error(`❌ Error al generar cargos de ${mes}:`, err.message)
  }
}

// ─── Red de seguridad al arrancar ──────────────────────────────────────────

/**
 * Se ejecuta cuando el servidor arranca.
 * Si estamos en los primeros 10 días del mes y aún no hay cargos mensuales,
 * los genera. Esto cubre el caso en que el servidor estaba caído el día 1.
 */
async function verificarCargosAlArrancar() {
  const hoy = new Date()
  const dia  = hoy.getDate()

  if (dia > 10) return // Fuera de la ventana de seguridad

  const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`

  const { data: existentes } = await supabase
    .from('Pagos')
    .select('id_pago')
    .eq('mes', mes)
    .eq('tipo', 'mensual')
    .limit(1)

  if (!existentes || existentes.length === 0) {
    console.log(`⚠️  Cargos de ${mes} no encontrados al arrancar. Generando...`)
    await generarCargosMensuales()
  }
}

// ─── Inicialización ────────────────────────────────────────────────────────

/**
 * Registra el cron job y ejecuta la verificación de arranque.
 * Llamar desde server.js al iniciar la aplicación.
 */
function iniciarCron() {
  // Corre el día 1 de cada mes a las 00:05 (hora Ciudad de México)
  cron.schedule('5 0 1 * *', generarCargosMensuales, {
    timezone: 'America/Mexico_City'
  })

  console.log('🕐 Cron activado — cargos automáticos el día 1 de cada mes a las 00:05 (CDMX)')

  // Verificación de seguridad al arrancar
  verificarCargosAlArrancar()
}

// ─── Exportar ──────────────────────────────────────────────────────────────

module.exports = { iniciarCron, generarCargosMensuales }
