// ================================
// cargos.service.js
// CEA Sistema de Gestión — Lógica compartida de generación de cargos
//
// Punto único de verdad para "qué cargo mensual le toca a quién". Antes
// esta lógica estaba duplicada (y desincronizada) entre cargos.cron.js y
// pagos.controller.js:generar(), lo que causaba que algunos alumnos se
// quedaran sin cargo según qué camino se usara. Ahora todos llaman aquí.
// ================================

const supabase = require('../config/db')

// ─── Fechas ancladas a CDMX (igual que cargos.cron.js) ─────────────────────

function hoyEnCDMX() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date())
  const get = (type) => Number(parts.find(p => p.type === type).value)
  return { year: get('year'), month: get('month'), day: get('day') } // month: 1-12
}

function mesActualISO() {
  const { year, month } = hoyEnCDMX()
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function mesSiguienteISO() {
  const { year, month } = hoyEnCDMX()
  const d = new Date(Date.UTC(year, month, 1)) // month (1-12) como índice 0-based ya apunta al siguiente
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Mes que le toca cobrar a un alumno que se inscribe/asigna HOY:
 * - Días 1-24: el mes en curso.
 * - Día 25 en adelante (el cron ya generó el mes siguiente para todos):
 *   el mes siguiente, no el actual — evita cobrar un mes que ya casi
 *   termina y, sobre todo, evita que el alumno se quede sin cargo del
 *   mes que sí le toca vivir casi completo.
 */
function mesACobrarISO() {
  const { day } = hoyEnCDMX()
  return day >= 25 ? mesSiguienteISO() : mesActualISO()
}

// ─── Generación idempotente ─────────────────────────────────────────────────

/**
 * Crea el cargo mensual pendiente de UN alumno para UN mes, si no existe ya.
 * No revisa activo/horario/precio — eso lo decide quien llama (el caller
 * conoce el contexto: alta manual, asignación de clase, barrido masivo).
 * Devuelve { creado: bool, pago, error }.
 */
async function asegurarCargoMensual(id_estudiante, mes, monto) {
  if (!id_estudiante || !mes) return { creado: false, error: 'Faltan datos.' }
  if (!(monto > 0)) return { creado: false, error: 'Sin precio_mensual válido, no se genera cargo.' }

  const { data: existe, error: errExiste } = await supabase
    .from('Pagos')
    .select('id_pago')
    .eq('id_estudiante', id_estudiante)
    .eq('mes', mes)
    .eq('tipo', 'mensual')
  if (errExiste) return { creado: false, error: errExiste.message }
  if (existe && existe.length > 0) return { creado: false, pago: existe[0] }

  const { data, error } = await supabase
    .from('Pagos')
    .insert([{ id_estudiante, mes, monto, estado: 'pendiente', tipo: 'mensual' }])
    .select().single()

  if (error) {
    // 23505 = choque con el índice único idx_pagos_mensual_unico: otro
    // proceso ganó la carrera y ya insertó el mismo cargo. No es un error
    // real, es el resultado correcto (el cargo existe).
    if (error.code === '23505') return { creado: false }
    return { creado: false, error: error.message }
  }
  return { creado: true, pago: data }
}

/**
 * Genera los cargos mensuales que falten para TODOS los alumnos activos
 * con horario asignado, para el mes indicado. Idempotente: se puede llamar
 * cuantas veces se quiera (cron, arranque, botón manual) sin duplicar nada
 * y sin dejar a nadie fuera por culpa de un ajuste/mantenimiento previo del
 * mismo mes (antes se preguntaba "¿ya existe ALGÚN pago de este alumno en
 * este mes?" en vez de "¿ya existe SU CARGO MENSUAL?").
 */
async function generarCargosFaltantes(mes) {
  const resultado = { mes, generados: 0, omitidosSinPrecio: [], errores: [] }

  const { data: estudiantes, error: errEst } = await supabase
    .from('Estudiantes')
    .select('id_estudiante, nombre, precio_mensual')
    .eq('activo', true)
  if (errEst) { resultado.errores.push(errEst.message); return resultado }
  if (!estudiantes || estudiantes.length === 0) return resultado

  const idsActivos = estudiantes.map(e => e.id_estudiante)
  const { data: horarios, error: errHor } = await supabase
    .from('HorariosAlumnos')
    .select('id_estudiante')
    .in('id_estudiante', idsActivos)
  if (errHor) { resultado.errores.push(errHor.message); return resultado }

  const idsConHorario = new Set((horarios || []).map(h => h.id_estudiante))
  const estudiantesConClase = estudiantes.filter(e => idsConHorario.has(e.id_estudiante))
  if (estudiantesConClase.length === 0) return resultado

  const { data: existentes, error: errExist } = await supabase
    .from('Pagos')
    .select('id_estudiante')
    .eq('mes', mes)
    .eq('tipo', 'mensual')
  if (errExist) { resultado.errores.push(errExist.message); return resultado }
  const idsExistentes = new Set((existentes || []).map(p => p.id_estudiante))

  const pendientesDeGenerar = estudiantesConClase.filter(e => !idsExistentes.has(e.id_estudiante))

  for (const e of pendientesDeGenerar) {
    if (!(e.precio_mensual > 0)) {
      resultado.omitidosSinPrecio.push({ id_estudiante: e.id_estudiante, nombre: e.nombre })
      continue
    }
    // Uno por uno (no insert en lote): así el índice único actúa como
    // respaldo real ante una carrera sin arriesgar los demás inserts.
    const { creado, error } = await asegurarCargoMensual(e.id_estudiante, mes, e.precio_mensual)
    if (error) resultado.errores.push(`#${e.id_estudiante} ${e.nombre}: ${error}`)
    else if (creado) resultado.generados++
  }

  return resultado
}

module.exports = {
  hoyEnCDMX,
  mesActualISO,
  mesSiguienteISO,
  mesACobrarISO,
  asegurarCargoMensual,
  generarCargosFaltantes
}
