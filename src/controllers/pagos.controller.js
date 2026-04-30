// ================================
// pagos.controller.js
// CEA Sistema de Gestión — Sin id_clase, monto desde precio_mensual
// ================================

const supabase = require('../config/db')

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
    const updates = {}
    if (estado     !== undefined) updates.estado     = estado
    if (monto      !== undefined) updates.monto      = monto
    if (metodo     !== undefined) updates.metodo     = metodo
    if (fecha_pago !== undefined) updates.fecha_pago = fecha_pago
    if (notas      !== undefined) updates.notas      = notas

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ message: 'No hay campos para actualizar.' })

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

// POST /api/pagos/generar — Genera cargos usando precio_mensual del estudiante
async function generar(req, res) {
  const { mes } = req.body
  if (!mes) return res.status(400).json({ message: 'El mes es requerido.' })

  try {
    // Todos los estudiantes activos con su precio
    const { data: estudiantes, error: errEst } = await supabase
      .from('Estudiantes')
      .select('id_estudiante, precio_mensual')
      .eq('activo', true)
    if (errEst) return res.status(500).json({ message: errEst.message })

    // Cargos ya existentes para ese mes
    const { data: existentes } = await supabase
      .from('Pagos').select('id_estudiante').eq('mes', mes)
    const idsExistentes = new Set((existentes || []).map(p => p.id_estudiante))

    // Generar solo los que no existen
    const nuevos = (estudiantes || [])
      .filter(e => !idsExistentes.has(e.id_estudiante))
      .map(e => ({
        id_estudiante: e.id_estudiante,
        mes,
        monto:  e.precio_mensual || 0,
        estado: 'pendiente',
        tipo:   'mensual'
      }))

    if (nuevos.length > 0) {
      const { error } = await supabase.from('Pagos').insert(nuevos)
      if (error) return res.status(500).json({ message: error.message })
    }

    res.json({ message: 'Cargos generados.', generados: nuevos.length })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// POST /api/pagos — Crear cargo individual
async function crear(req, res) {
  const { id_estudiante, mes, monto, es_inscripcion, tipo } = req.body
  if (!id_estudiante) return res.status(400).json({ message: 'Faltan datos.' })

  try {
    // Cargo de ajuste (proporcional por clase agregada/descontada)
    if (tipo === 'ajuste') {
      if (!mes || monto === undefined) return res.status(400).json({ message: 'Faltan datos para el ajuste.' })
      const { data, error } = await supabase
        .from('Pagos')
        .insert([{ id_estudiante, mes, monto, estado: 'pendiente', tipo: 'ajuste' }])
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
        .insert([{ id_estudiante, mes: null, monto: monto || 0, estado: 'pendiente', tipo: 'inscripcion' }])
        .select().single()
      if (error) return res.status(500).json({ message: error.message })
      return res.status(201).json({ message: 'Cargo de inscripción creado.', pago: data })
    }

    // Cargo mensual — verificar que no exista ya
    const { data: existe } = await supabase
      .from('Pagos').select('id_pago')
      .eq('id_estudiante', id_estudiante).eq('mes', mes).eq('tipo', 'mensual')
    if (existe && existe.length > 0)
      return res.json({ message: 'El cargo ya existe.', existe: true })

    const { estado, metodo, fecha_pago } = req.body
    const registro = {
      id_estudiante,
      mes,
      monto:  monto || 0,
      estado: estado || 'pendiente',
      tipo:   'mensual'
    }
    if (metodo)    registro.metodo     = metodo
    if (fecha_pago) registro.fecha_pago = fecha_pago

    const { data, error } = await supabase
      .from('Pagos').insert([registro]).select().single()
    if (error) return res.status(500).json({ message: error.message })
    res.status(201).json({ message: 'Cargo creado.', pago: data })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// DELETE /api/pagos/:id
async function eliminar(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('Pagos')
      .delete()
      .eq('id_pago', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Cargo eliminado.' })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

module.exports = { listar, contarPendientes, actualizar, generar, crear, eliminar }