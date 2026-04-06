// ================================
// horarios.controller.js
// CEA Sistema de Gestión
// ================================

const supabase = require('../config/db')

// GET /api/horarios/maestro/:id
async function porMaestro(req, res) {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('horarios')
      .select('*')
      .eq('maestro_id', id)
      .order('dia').order('hora_inicio')
    if (error) return res.status(500).json({ message: error.message })
    res.json({ horarios: data })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// GET /api/horarios/estudiante/:id
async function porEstudiante(req, res) {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('horarios')
      .select('*')
      .eq('estudiante_id', id)
      .order('dia').order('hora_inicio')
    if (error) return res.status(500).json({ message: error.message })
    res.json({ horarios: data })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// POST /api/horarios
async function crear(req, res) {
  const { estudiante_id, maestro_id, clase_id, dia, hora_inicio, hora_fin } = req.body
  if (!estudiante_id || !maestro_id || !dia || !hora_inicio)
    return res.status(400).json({ message: 'Faltan datos requeridos.' })

  try {
    // Verificar conflicto de horario
    const { data: existing } = await supabase
      .from('horarios')
      .select('id')
      .eq('maestro_id', maestro_id)
      .eq('dia', dia)
      .eq('hora_inicio', hora_inicio)

    if (existing && existing.length > 0) {
      // Clases grupales pueden tener varios alumnos al mismo horario
      const clase = await supabase.from('clases').select('tipo').eq('id', clase_id).single()
      if (!clase.data || clase.data.tipo !== 'grupal') {
        return res.status(409).json({ message: 'Este horario ya está ocupado para una clase individual.' })
      }
    }

    const { data, error } = await supabase
      .from('horarios')
      .insert([{ estudiante_id, maestro_id, clase_id, dia, hora_inicio, hora_fin }])
      .select().single()
    if (error) return res.status(500).json({ message: error.message })
    res.status(201).json({ message: 'Horario asignado.', horario: data })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// DELETE /api/horarios/estudiante/:id — Borrar todos los horarios de un estudiante
async function eliminarPorEstudiante(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase.from('horarios').delete().eq('estudiante_id', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Horarios del estudiante eliminados.' })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// DELETE /api/horarios/:id — Borrar un horario específico
async function eliminar(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase.from('horarios').delete().eq('id', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Horario eliminado.' })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

module.exports = { porMaestro, porEstudiante, crear, eliminar, eliminarPorEstudiante }