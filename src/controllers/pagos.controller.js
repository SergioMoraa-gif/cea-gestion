// ================================
// pagos.controller.js
// CEA Sistema de Gestión — Sin id_clase, monto desde precio_mensual
// ================================

const supabase = require('../config/db')
const { generarCargosFaltantes } = require('../services/cargos.service')

const TIPOS_VALIDOS   = ['mensual', 'ajuste', 'inscripcion', 'mantenimiento']
const ESTADOS_VALIDOS = ['pendiente', 'pagado', 'en_transito']

// Un monto válido es un número finito y no negativo (0 se permite para no
// romper flujos existentes, pero /generar y el cron ya lo evitan por su cuenta).
function montoValido(m) {
  const n = Number(m)
  return Number.isFinite(n) && n >= 0
}

// Normaliza "YYYY-MM" o "YYYY-MM-DD" a "YYYY-MM-01" — todos los cargos se
// guardan anclados al día 1 del mes; si se cuela otro día se rompe la
// unicidad alumno+mes (el índice único solo cubre el valor exacto).
function normalizarMes(mes) {
  if (!mes) return mes
  const m = String(mes).match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-01` : mes
}

// GET /api/pagos
async function listar(req, res) {
  const { mes, estado, id_estudiante, tipo } = req.query
  try {
    let query = supabase
      .from('Pagos')
      .select('*')
      .order('fecha_creacion', { ascending: false })

    if (tipo) {
      query = query.eq('tipo', tipo)
    } else if (mes) {
      // Sin filtro de tipo: traer cargos mensuales del mes dado + inscripciones creadas ese mes
      const [anio, mesNum] = mes.split('-').map(Number)
      const siguiente = mesNum === 12
        ? `${anio + 1}-01-01`
        : `${anio}-${String(mesNum + 1).padStart(2,'0')}-01`
      const inicioISO = `${mes}-01T00:00:00`
      const siguienteISO = `${siguiente}T00:00:00`
      // Pagos mensuales + ajustes del periodo OR inscripciones creadas en ese periodo
      query = query.or(
        `and(tipo.eq.mensual,mes.gte.${mes}-01,mes.lt.${siguiente}),and(tipo.eq.ajuste,mes.gte.${mes}-01,mes.lt.${siguiente}),and(tipo.eq.inscripcion,fecha_creacion.gte.${inicioISO},fecha_creacion.lt.${siguienteISO})`
      )
    }

    if (estado)        query = query.eq('estado', estado)
    if (id_estudiante) query = query.eq('id_estudiante', parseInt(id_estudiante))

    const { data, error } = await query
    if (error) return res.status(500).json({ message: error.message })
    res.json({ pagos: data })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// GET /api/pagos/pendientes — count para dashboard
async function contarPendientes(_req, res) {
  try {
    const { count, error } = await supabase
      .from('Pagos')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
    if (error) return res.status(500).json({ message: error.message })
    res.json({ total: count })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// PATCH /api/pagos/:id
async function actualizar(req, res) {
  const { id } = req.params
  const { estado, monto, metodo, fecha_pago, notas } = req.body
  try {
    const { data: actual, error: errActual } = await supabase
      .from('Pagos').select('*').eq('id_pago', id).single()
    if (errActual || !actual) return res.status(404).json({ message: 'Pago no encontrado.' })

    if (estado !== undefined && !ESTADOS_VALIDOS.includes(estado))
      return res.status(400).json({ message: `Estado inválido. Usa: ${ESTADOS_VALIDOS.join(', ')}.` })
    if (monto !== undefined && !montoValido(monto))
      return res.status(400).json({ message: 'El monto debe ser un número mayor o igual a 0.' })

    const updates = {}
    if (estado     !== undefined) updates.estado     = estado
    if (monto      !== undefined) updates.monto      = Number(monto)
    if (metodo     !== undefined) updates.metodo     = metodo
    if (fecha_pago !== undefined) updates.fecha_pago = fecha_pago
    if (notas      !== undefined) updates.notas      = notas

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ message: 'No hay campos para actualizar.' })

    // Estado final tras aplicar los cambios (puede venir solo el estado, o
    // solo el método, etc. — hay que mirar el resultado completo).
    const estadoFinal = updates.estado !== undefined ? updates.estado : actual.estado
    const metodoFinal = updates.metodo !== undefined ? updates.metodo : actual.metodo
    const fechaFinal  = updates.fecha_pago !== undefined ? updates.fecha_pago : actual.fecha_pago

    if (estadoFinal !== 'pendiente' && (!metodoFinal || !fechaFinal))
      return res.status(400).json({ message: 'Para marcar un pago como pagado o en tránsito hace falta método y fecha de pago.' })

    // Al regresar un pago a "pendiente" se limpian método/fecha — si no, queda
    // un registro contradictorio (pendiente pero con rastro de un cobro que
    // ya no existe).
    if (estadoFinal === 'pendiente' && updates.estado === 'pendiente') {
      updates.metodo     = null
      updates.fecha_pago = null
    }

    const { data, error } = await supabase
      .from('Pagos')
      .update(updates)
      .eq('id_pago', id)
      .select()
      .single()
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Pago actualizado.', pago: data })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// POST /api/pagos/generar — Genera los cargos mensuales que falten para el mes dado
async function generar(req, res) {
  const mes = normalizarMes(req.body.mes)
  if (!mes) return res.status(400).json({ message: 'El mes es requerido.' })

  try {
    const { generados, omitidosSinPrecio, errores } = await generarCargosFaltantes(mes)
    if (errores.length > 0) return res.status(500).json({ message: errores.join(' | ') })
    res.json({
      message: 'Cargos generados.',
      generados,
      omitidosSinPrecio: omitidosSinPrecio.map(e => e.nombre)
    })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// POST /api/pagos — Crear cargo individual
async function crear(req, res) {
  const { id_estudiante, mes: mesCrudo, monto, es_inscripcion, tipo } = req.body
  const mes = normalizarMes(mesCrudo)
  if (!id_estudiante) return res.status(400).json({ message: 'Faltan datos.' })
  if (tipo !== undefined && !TIPOS_VALIDOS.includes(tipo))
    return res.status(400).json({ message: `Tipo inválido. Usa: ${TIPOS_VALIDOS.join(', ')}.` })
  if (monto !== undefined && !montoValido(monto))
    return res.status(400).json({ message: 'El monto debe ser un número mayor o igual a 0.' })

  try {
    const { data: estudiante, error: errEst } = await supabase
      .from('Estudiantes').select('id_estudiante').eq('id_estudiante', id_estudiante).single()
    if (errEst || !estudiante) return res.status(404).json({ message: 'El alumno no existe.' })

    // Cargo de ajuste (proporcional por clase agregada/descontada)
    if (tipo === 'ajuste') {
      if (!mes || monto === undefined) return res.status(400).json({ message: 'Faltan datos para el ajuste.' })
      const { data, error } = await supabase
        .from('Pagos')
        .insert([{ id_estudiante, mes, monto: Number(monto), estado: 'pendiente', tipo: 'ajuste' }])
        .select().single()
      if (error) return res.status(500).json({ message: error.message })
      return res.status(201).json({ message: 'Ajuste creado.', pago: data })
    }

    if (!mes && !es_inscripcion) return res.status(400).json({ message: 'Faltan datos.' })

    if (es_inscripcion) {
      // Verificar que no exista ya una inscripción para este alumno
      const { data: existe } = await supabase
        .from('Pagos').select('id_pago')
        .eq('id_estudiante', id_estudiante)
        .eq('tipo', 'inscripcion')
      if (existe && existe.length > 0)
        return res.json({ message: 'La inscripción ya existe.', existe: true })

      const { data, error } = await supabase
        .from('Pagos')
        .insert([{ id_estudiante, mes: null, monto: monto !== undefined ? Number(monto) : 0, estado: 'pendiente', tipo: 'inscripcion' }])
        .select().single()
      if (error) {
        // 23505 = choque con idx_pagos_inscripcion_unico (scripts/2026-09-unique-inscripcion.sql):
        // dos clics a la vez, gana el primero y el segundo recibe "ya existe" en vez de un 500 crudo.
        if (error.code === '23505')
          return res.json({ message: 'La inscripción ya existe.', existe: true })
        return res.status(500).json({ message: error.message })
      }
      return res.status(201).json({ message: 'Cargo de inscripción creado.', pago: data })
    }

    // Cargo mensual — verificar que no exista ya
    const { data: existe } = await supabase
      .from('Pagos').select('id_pago')
      .eq('id_estudiante', id_estudiante).eq('mes', mes).eq('tipo', 'mensual')
    if (existe && existe.length > 0)
      return res.json({ message: 'El cargo ya existe.', existe: true })

    const { estado, metodo, fecha_pago } = req.body
    if (estado !== undefined && !ESTADOS_VALIDOS.includes(estado))
      return res.status(400).json({ message: `Estado inválido. Usa: ${ESTADOS_VALIDOS.join(', ')}.` })
    if (estado && estado !== 'pendiente' && (!metodo || !fecha_pago))
      return res.status(400).json({ message: 'Para registrar un cargo como pagado hace falta método y fecha de pago.' })

    const registro = {
      id_estudiante,
      mes,
      monto:  monto !== undefined ? Number(monto) : 0,
      estado: estado || 'pendiente',
      tipo:   'mensual'
    }
    if (metodo)    registro.metodo     = metodo
    if (fecha_pago) registro.fecha_pago = fecha_pago

    const { data, error } = await supabase
      .from('Pagos').insert([registro]).select().single()
    if (error) {
      if (error.code === '23505')
        return res.json({ message: 'El cargo ya existe.', existe: true })
      return res.status(500).json({ message: error.message })
    }
    res.status(201).json({ message: 'Cargo creado.', pago: data })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// DELETE /api/pagos/:id
async function eliminar(req, res) {
  const { id } = req.params
  const force = req.query.force === 'true'
  try {
    const { data: actual, error: errActual } = await supabase
      .from('Pagos').select('id_pago, estado').eq('id_pago', id).single()
    if (errActual || !actual) return res.status(404).json({ message: 'Cargo no encontrado.' })

    if (actual.estado !== 'pendiente' && !force)
      return res.status(409).json({
        message: 'Este cargo ya está pagado o en tránsito. Vuelve a intentarlo confirmando la eliminación.',
        requiereConfirmacion: true
      })

    const { error } = await supabase
      .from('Pagos')
      .delete()
      .eq('id_pago', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Cargo eliminado.' })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

module.exports = { listar, contarPendientes, actualizar, generar, crear, eliminar }
