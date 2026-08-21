// ================================
// cargos.cron.js — Generación automática de cargos mensuales
// CEA Sistema de Gestión
// ================================

const cron     = require('node-cron')
const supabase = require('../config/db')

// ─── Lógica principal ───────────────────────────────────────────────────────

/**
 * Fecha de "hoy" anclada explícitamente a la zona horaria de Ciudad de
 * México, sin importar en qué zona horaria esté configurado el sistema
 * operativo del servidor (p. ej. si el hosting corre en UTC). El
 * cron.schedule ya dispara a la hora correcta en CDMX; esto asegura que el
 * cálculo del día/mes dentro de la función coincida con esa misma zona.
 */
function hoyEnCDMX() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const get = (type) => Number(parts.find(p => p.type === type).value)
  return { year: get('year'), month: get('month'), day: get('day') } // month: 1-12
}

/**
 * Calcula el string "YYYY-MM-01" del mes siguiente al actual (en CDMX).
 * Los cargos se generan 5 días antes de que arranque ese mes (día 25 del
 * mes anterior), para que ya estén disponibles para registrar pagos desde
 * el día 1.
 */
function mesSiguienteISO() {
  const { year, month } = hoyEnCDMX()
  // Date.UTC toma el mes como índice base-0, así que pasar el mes actual
  // (base-1) apunta directo al mes siguiente (base-0) — evita otro +1 manual.
  const d = new Date(Date.UTC(year, month, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Genera cargos pendientes del MES SIGUIENTE para los alumnos activos que
 * además tengan al menos un horario/clase asignado en este momento
 * (HorariosAlumnos). Si un alumno no tiene clase, no se le cobra aunque
 * siga marcado como activo. Si el cargo del mes ya existe para un alumno,
 * lo omite (no duplica).
 */
async function generarCargosMensuales() {
  const mes = mesSiguienteISO()

  console.log(`\n📋 Generando cargos automáticos para ${mes} (mes siguiente)...`)

  try {
    // 1. Obtener todos los alumnos activos
    const { data: estudiantes, error: errEst } = await supabase
      .from('Estudiantes')
      .select('id_estudiante, nombre, precio_mensual')
      .eq('activo', true)

    if (errEst)  throw new Error(errEst.message)
    if (!estudiantes || estudiantes.length === 0) {
      console.log('ℹ️  Sin alumnos activos. No se generaron cargos.')
      return
    }

    // 2. De esos, quedarnos solo con los que tienen horario/clase asignado.
    //    Se acota la consulta a los ids de alumnos activos en vez de traer
    //    la tabla HorariosAlumnos completa.
    const idsActivos = estudiantes.map(e => e.id_estudiante)
    const { data: horarios, error: errHor } = await supabase
      .from('HorariosAlumnos')
      .select('id_estudiante')
      .in('id_estudiante', idsActivos)

    if (errHor) throw new Error(errHor.message)
    const idsConHorario = new Set((horarios || []).map(h => h.id_estudiante))
    const estudiantesConClase = estudiantes.filter(e => idsConHorario.has(e.id_estudiante))

    if (estudiantesConClase.length === 0) {
      console.log('ℹ️  Ningún alumno activo tiene horario asignado. No se generaron cargos.')
      return
    }

    // 3. Separar a los que no tienen precio_mensual configurado: no se les
    //    genera un cargo de $0 en silencio, se avisa para que se corrija.
    const sinPrecio          = estudiantesConClase.filter(e => !e.precio_mensual || e.precio_mensual <= 0)
    const conPrecioValido    = estudiantesConClase.filter(e => e.precio_mensual > 0)

    if (sinPrecio.length > 0) {
      console.warn(
        `⚠️  ${sinPrecio.length} alumno(s) con horario asignado pero sin precio_mensual configurado ` +
        `(no se les generó cargo de ${mes}): ` +
        sinPrecio.map(e => `${e.nombre} (#${e.id_estudiante})`).join(', ')
      )
    }

    if (conPrecioValido.length === 0) {
      console.log('ℹ️  Nadie con precio_mensual válido. No se generaron cargos.')
      return
    }

    // 4. Verificar qué cargos mensuales ya existen para este mes
    const { data: existentes } = await supabase
      .from('Pagos')
      .select('id_estudiante')
      .eq('mes', mes)
      .eq('tipo', 'mensual')

    const idsExistentes = new Set((existentes || []).map(p => p.id_estudiante))

    // 5. Crear solo los cargos que faltan
    const nuevos = conPrecioValido
      .filter(e => !idsExistentes.has(e.id_estudiante))
      .map(e => ({
        id_estudiante: e.id_estudiante,
        mes,
        monto:  e.precio_mensual,
        estado: 'pendiente',
        tipo:   'mensual'
      }))

    if (nuevos.length === 0) {
      console.log('ℹ️  Todos los cargos del mes ya existían. Nada que generar.')
      return
    }

    // Se inserta uno por uno (en vez de un solo insert por lote) para que el
    // índice único idx_pagos_mensual_unico (alumno+mes, solo tipo='mensual')
    // actúe como respaldo real ante una carrera: si dos procesos intentaran
    // generar el mismo cargo al mismo tiempo, Postgres rechaza el duplicado
    // con un error 23505 y aquí simplemente se omite esa fila — un insert en
    // lote habría hecho rollback de los demás cargos válidos por ese único
    // choque.
    let generados = 0
    let omitidosPorCarrera = 0
    for (const cargo of nuevos) {
      const { error: errInsert } = await supabase.from('Pagos').insert([cargo])
      if (errInsert) {
        if (errInsert.code === '23505') {
          omitidosPorCarrera++
          continue
        }
        throw new Error(errInsert.message)
      }
      generados++
    }

    if (omitidosPorCarrera > 0) {
      console.warn(`⚠️  ${omitidosPorCarrera} cargo(s) omitido(s) por ya existir (carrera evitada por el índice único).`)
    }
    console.log(`✅ ${generados} cargo(s) generado(s) correctamente para ${mes}.`)
  } catch (err) {
    console.error(`❌ Error al generar cargos de ${mes}:`, err.message)
  }
}

// ─── Red de seguridad al arrancar ──────────────────────────────────────────

/**
 * Se ejecuta cuando el servidor arranca.
 * Si estamos en la ventana del día 25-27 y aún no hay cargos del mes
 * siguiente, los genera. Esto cubre el caso en que el servidor estaba
 * caído el día 25.
 */
async function verificarCargosAlArrancar() {
  const { day: dia } = hoyEnCDMX()

  if (dia < 25 || dia > 27) return // Fuera de la ventana de seguridad

  const mes = mesSiguienteISO()

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
