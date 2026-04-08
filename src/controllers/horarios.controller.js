// ================================
// horarios.controller.js
// CEA Sistema de Gestión — Usa HorariosAlumnos
// ================================

const supabase = require('../config/db')

// GET /api/horarios/maestro/:id
async function porMaestro(req, res) {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('HorariosAlumnos')
      .select('*')
      .eq('id_maestro', id)
      .order('dia')
      .order('hora_inicio')
    if (error) return res.status(500).json({ message: error.message })

    // Normalizar para compatibilidad con el frontend
    const horarios = (data || []).map(h => ({
      id:            h.id_horario,
      id_horario:    h.id_horario,
      estudiante_id: h.id_estudiante,
      id_estudiante: h.id_estudiante,
      maestro_id:    h.id_maestro,
      id_maestro:    h.id_maestro,
      clase_id:      null,
      dia:           h.dia,
      hora_inicio:   h.hora_inicio,
      hora_fin:      h.hora_final,
      hora_final:    h.hora_final,
      tipo:          h.tipo,
      duracion:      h.duracion
    }))

    res.json({ horarios })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// GET /api/horarios/estudiante/:id
async function porEstudiante(req, res) {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('HorariosAlumnos')
      .select('*')
      .eq('id_estudiante', id)
      .order('dia')
      .order('hora_inicio')
    if (error) return res.status(500).json({ message: error.message })

    const horarios = (data || []).map(h => ({
      id:            h.id_horario,
      id_horario:    h.id_horario,
      estudiante_id: h.id_estudiante,
      id_estudiante: h.id_estudiante,
      maestro_id:    h.id_maestro,
      id_maestro:    h.id_maestro,
      dia:           h.dia,
      hora_inicio:   h.hora_inicio,
      hora_fin:      h.hora_final,
      hora_final:    h.hora_final,
      tipo:          h.tipo,
      duracion:      h.duracion
    }))

    res.json({ horarios })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// POST /api/horarios — Crear bloque en el calendario
async function crear(req, res) {
  const {
    estudiante_id, id_estudiante,
    maestro_id,    id_maestro,
    dia, hora_inicio, hora_fin, hora_final,
    tipo, duracion
  } = req.body

  const estId  = id_estudiante || estudiante_id
  const maestId = id_maestro   || maestro_id
  const horaFin = hora_final   || hora_fin

  if (!estId || !maestId || !dia || !hora_inicio)
    return res.status(400).json({ message: 'Faltan datos requeridos.' })

  try {
    // Verificar conflicto — individual no puede solaparse
    const tipoBloque = tipo || 'individual'
    if (tipoBloque === 'individual') {
      const { data: existing } = await supabase
        .from('HorariosAlumnos')
        .select('id_horario')
        .eq('id_maestro', maestId)
        .eq('dia', dia)
        .eq('hora_inicio', hora_inicio)
        .eq('tipo', 'individual')

      if (existing && existing.length > 0)
        return res.status(409).json({ message: 'Este horario ya está ocupado por una clase individual.' })
    }

    const { data, error } = await supabase
      .from('HorariosAlumnos')
      .insert([{
        id_estudiante: parseInt(estId),
        id_maestro:    parseInt(maestId),
        dia,
        hora_inicio,
        hora_final:    horaFin,
        tipo:          tipoBloque,
        duracion:      duracion || 30
      }])
      .select()
      .single()

    if (error) return res.status(500).json({ message: error.message })

    res.status(201).json({
      message: 'Horario asignado.',
      horario: {
        id:            data.id_horario,
        id_horario:    data.id_horario,
        estudiante_id: data.id_estudiante,
        maestro_id:    data.id_maestro,
        dia:           data.dia,
        hora_inicio:   data.hora_inicio,
        hora_fin:      data.hora_final,
        tipo:          data.tipo,
        duracion:      data.duracion
      }
    })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// PATCH /api/horarios/:id — Modificar un bloque (tipo, duración, hora_inicio, hora_final, dia)
async function actualizar(req, res) {
  const { id } = req.params
  const { dia, hora_inicio, hora_fin, hora_final, tipo, duracion } = req.body
  const horaFin = hora_final || hora_fin

  const updates = {}
  if (dia)         updates.dia         = dia
  if (hora_inicio) updates.hora_inicio = hora_inicio
  if (horaFin)     updates.hora_final  = horaFin
  if (tipo)        updates.tipo        = tipo
  if (duracion)    updates.duracion    = duracion

  try {
    const { data, error } = await supabase
      .from('HorariosAlumnos')
      .update(updates)
      .eq('id_horario', id)
      .select()
      .single()
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Horario actualizado.', horario: data })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// DELETE /api/horarios/estudiante/:id — Borrar todos los horarios de un estudiante
async function eliminarPorEstudiante(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('HorariosAlumnos').delete().eq('id_estudiante', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Horarios del estudiante eliminados.' })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// DELETE /api/horarios/:id — Borrar un horario específico
async function eliminar(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('HorariosAlumnos').delete().eq('id_horario', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Horario eliminado.' })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

module.exports = { porMaestro, porEstudiante, crear, actualizar, eliminar, eliminarPorEstudiante }