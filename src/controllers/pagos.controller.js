// ================================
// pagos.controller.js
// CEA Sistema de Gestión — Esquema nuevo
// ================================

const supabase = require('../config/db')

// GET /api/pagos
async function listar(req, res) {
  const { mes, estado } = req.query
  try {
    let query = supabase
      .from('Pagos')
      .select('*')
      .order('fecha_creacion', { ascending: false })

    if (mes)    query = query.gte('mes', mes + '-01').lte('mes', mes + '-31')
    if (estado) query = query.eq('estado', estado)

    const { data, error } = await query
    if (error) return res.status(500).json({ message: error.message })
    res.json({ pagos: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// GET /api/pagos/pendientes/count
async function contarPendientes(req, res) {
  try {
    const { count, error } = await supabase
      .from('Pagos')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
    if (error) return res.status(500).json({ message: error.message })
    res.json({ total: count })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// PATCH /api/pagos/:id
async function actualizar(req, res) {
  const { id } = req.params
  const { estado, monto, metodo, fecha_pago, notas } = req.body
  try {
    const updates = { estado }
    if (monto      !== undefined) updates.monto      = monto
    if (metodo     !== undefined) updates.metodo     = metodo
    if (fecha_pago !== undefined) updates.fecha_pago = fecha_pago
    if (notas      !== undefined) updates.notas      = notas

    const { data, error } = await supabase
      .from('Pagos')
      .update(updates)
      .eq('id_pago', id)
      .select()
      .single()

    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Pago actualizado.', pago: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// POST /api/pagos/generar
// Genera cargos mensuales para todos los estudiantes activos
async function generar(req, res) {
  const { mes } = req.body
  if (!mes) return res.status(400).json({ message: 'El mes es requerido.' })

  try {
    // Obtener todos los estudiantes activos con su clase via EstudiantesClases
    const { data: inscripciones, error: errInsc } = await supabase
      .from('EstudiantesClases')
      .select(`
        id_estudiante,
        id_clase,
        Estudiantes ( activo ),
        Clases ( costo_mensual )
      `)

    if (errInsc) return res.status(500).json({ message: errInsc.message })

    // Solo los activos
    const activos = (inscripciones || []).filter(i => i.Estudiantes?.activo === true)

    // Obtener cargos ya existentes para ese mes
    const { data: existentes } = await supabase
      .from('Pagos')
      .select('id_estudiante')
      .eq('mes', mes)

    const idsExistentes = new Set((existentes || []).map(p => p.id_estudiante))

    // Generar solo los que no existen
    const nuevos = []
    for (const insc of activos) {
      if (!idsExistentes.has(insc.id_estudiante)) {
        nuevos.push({
          id_estudiante: insc.id_estudiante,
          id_clase:      insc.id_clase,
          mes,
          monto:  insc.Clases?.costo_mensual || 0,
          estado: 'pendiente'
        })
      }
    }

    if (nuevos.length > 0) {
      const { error } = await supabase.from('Pagos').insert(nuevos)
      if (error) return res.status(500).json({ message: error.message })
    }

    res.json({ message: 'Cargos generados.', generados: nuevos.length })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// POST /api/pagos — Crear cargo individual
async function crear(req, res) {
  const { id_estudiante, id_clase, mes, monto } = req.body

  // Soportar alias del esquema anterior
  const estudianteId = id_estudiante || req.body.estudiante_id
  const claseId      = id_clase      || req.body.clase_id

  if (!estudianteId || !mes) return res.status(400).json({ message: 'Faltan datos.' })

  try {
    // Verificar que no exista ya
    const { data: existe } = await supabase
      .from('Pagos')
      .select('id_pago')
      .eq('id_estudiante', estudianteId)
      .eq('mes', mes)

    if (existe && existe.length > 0)
      return res.json({ message: 'El cargo ya existe.', existe: true })

    const { data, error } = await supabase
      .from('Pagos')
      .insert([{ id_estudiante: estudianteId, id_clase: claseId, mes, monto, estado: 'pendiente' }])
      .select()
      .single()

    if (error) return res.status(500).json({ message: error.message })
    res.status(201).json({ message: 'Cargo creado.', pago: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

module.exports = { listar, contarPendientes, actualizar, generar, crear }
