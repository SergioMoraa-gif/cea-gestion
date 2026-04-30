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

  if (dia < 25 || dia > 27) return // Fuera de la ventana de seguridad

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

// ─── Cargo único de mantenimiento — Mayo 2026 ──────────────────────────────

async function generarCargoMantenimiento() {
  const mes   = '2026-05-01'
  const MONTO = 500

  console.log('\n🔧 Generando cargo de mantenimiento mayo 2026...')

  try {
    const { data: estudiantes, error: errEst } = await supabase
      .from('Estudiantes')
      .select('id_estudiante')
      .eq('activo', true)

    if (errEst) throw new Error(errEst.message)
    if (!estudiantes || estudiantes.length === 0) {
      console.log('ℹ️  Sin alumnos activos. No se generaron cargos.')
      return
    }

    const { data: existentes } = await supabase
      .from('Pagos')
      .select('id_estudiante')
      .eq('mes', mes)
      .eq('tipo', 'mantenimiento')

    const idsExistentes = new Set((existentes || []).map(p => p.id_estudiante))

    const nuevos = estudiantes
      .filter(e => !idsExistentes.has(e.id_estudiante))
      .map(e => ({
        id_estudiante: e.id_estudiante,
        mes,
        monto:  MONTO,
        estado: 'pendiente',
        tipo:   'mantenimiento'
      }))

    if (nuevos.length === 0) {
      console.log('ℹ️  Cargo de mantenimiento ya existía para todos. Nada que generar.')
      return
    }

    const { error: errInsert } = await supabase.from('Pagos').insert(nuevos)
    if (errInsert) throw new Error(errInsert.message)

    console.log(`✅ ${nuevos.length} cargo(s) de mantenimiento generado(s) — $${MONTO} c/u.`)
  } catch (err) {
    console.error('❌ Error al generar cargo de mantenimiento:', err.message)
  }
}

async function verificarMantenimientoAlArrancar() {
  const hoy  = new Date()
  const anio = hoy.getFullYear()
  const mes  = hoy.getMonth() + 1
  const dia  = hoy.getDate()

  // Ventana: 15–17 de mayo de 2026
  if (anio !== 2026 || mes !== 5 || dia < 15 || dia > 17) return

  const { data: existentes } = await supabase
    .from('Pagos')
    .select('id_pago')
    .eq('mes', '2026-05-01')
    .eq('tipo', 'mantenimiento')
    .limit(1)

  if (!existentes || existentes.length === 0) {
    console.log('⚠️  Cargo de mantenimiento mayo 2026 no encontrado al arrancar. Generando...')
    await generarCargoMantenimiento()
  }
}

// ─── Inicialización ────────────────────────────────────────────────────────

/**
 * Registra el cron job y ejecuta la verificación de arranque.
 * Llamar desde server.js al iniciar la aplicación.
 */
function iniciarCron() {
  // Corre el día 25 de cada mes a las 00:05 (hora Ciudad de México)
  cron.schedule('5 0 25 * *', generarCargosMensuales, {
    timezone: 'America/Mexico_City'
  })
  console.log('🕐 Cron activado — cargos automáticos el día 25 de cada mes a las 00:05 (CDMX)')

  // Cargo único de mantenimiento el 15 de mayo de 2026 a las 00:05
  let taskManto
  taskManto = cron.schedule('5 0 15 5 *', async () => {
    await generarCargoMantenimiento()
    taskManto.destroy()
  }, { timezone: 'America/Mexico_City' })
  console.log('🔧 Cron activado — cargo de mantenimiento el 15 de mayo 2026 a las 00:05 (CDMX)')

  // Verificaciones de seguridad al arrancar
  verificarCargosAlArrancar()
  verificarMantenimientoAlArrancar()
}

// ─── Exportar ──────────────────────────────────────────────────────────────

module.exports = { iniciarCron, generarCargosMensuales, generarCargoMantenimiento }
