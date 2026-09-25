// ================================
// cargos.cron.js — Generación automática de cargos mensuales
// CEA Sistema de Gestión
// ================================

const cron     = require('node-cron')
const supabase = require('../config/db')
const {
  hoyEnCDMX,
  mesSiguienteISO,
  generarCargosFaltantes
} = require('../services/cargos.service')

// ─── Lógica principal ───────────────────────────────────────────────────────

/**
 * Genera los cargos pendientes del MES SIGUIENTE que falten para los
 * alumnos activos con horario asignado y precio_mensual válido. Usa
 * generarCargosFaltantes() (src/services/cargos.service.js), que es
 * idempotente por alumno — se puede llamar cuantas veces se quiera sin
 * duplicar nada.
 */
async function generarCargosMensuales() {
  const mes = mesSiguienteISO()
  console.log(`\n📋 Generando cargos automáticos para ${mes} (mes siguiente)...`)

  const { generados, omitidosSinPrecio, errores } = await generarCargosFaltantes(mes)

  if (omitidosSinPrecio.length > 0) {
    console.warn(
      `⚠️  ${omitidosSinPrecio.length} alumno(s) con horario asignado pero sin precio_mensual configurado ` +
      `(no se les generó cargo de ${mes}): ` +
      omitidosSinPrecio.map(e => `${e.nombre} (#${e.id_estudiante})`).join(', ')
    )
  }
  if (errores.length > 0) {
    console.error(`❌ ${errores.length} error(es) al generar cargos de ${mes}:`)
    errores.forEach(e => console.error(`   ${e}`))
  }
  console.log(`✅ ${generados} cargo(s) nuevo(s) generado(s) para ${mes}.`)
}

// ─── Red de seguridad al arrancar ──────────────────────────────────────────

/**
 * Se ejecuta cuando el servidor arranca. Desde el día 25 del mes (cuando
 * ya le toca existir el cargo del mes siguiente) hasta fin de mes, vuelve a
 * correr generarCargosFaltantes() para el mes siguiente. Es idempotente y
 * por alumno, así que no importa si el cron de las 00:05 nunca llegó a
 * correr (servidor apagado) o si alguien ya generó un cargo adelantado a
 * mano para un alumno puntual — a los demás igual se les genera el suyo.
 */
async function verificarCargosAlArrancar() {
  const { day: dia } = hoyEnCDMX()
  if (dia < 25) return // Antes del día 25 el mes siguiente ni le toca a nadie

  const mes = mesSiguienteISO()
  console.log(`🔎 Verificando cargos de ${mes} al arrancar (día ${dia})...`)
  await generarCargosMensuales()
}

// ─── Cargo único de mantenimiento — Mayo 2026 ──────────────────────────────
// (Ya se ejecutó; se conserva por si hace falta reconstruir un respaldo.)

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
