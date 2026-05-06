// ================================
// horarios.controller.js
// CEA Sistema de Gestión — Usa HorariosAlumnos
// ================================

const supabase = require('../config/db')

const TIPOS_VALIDOS = ['individual', 'grupal', 'matros']

function normalizar(h) {
  return {
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
    duracion:      h.duracion,
    alberca:       h.alberca
  }
}

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
    res.json({ horarios: (data || []).map(normalizar) })
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
    res.json({ horarios: (data || []).map(normalizar) })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// GET /api/horarios/global — Todos los horarios de todos los maestros
async function global(req, res) {
  try {
    const { data, error } = await supabase
      .from('HorariosAlumnos')
      .select('*')
      .order('dia')
      .order('hora_inicio')
    if (error) return res.status(500).json({ message: error.message })
    res.json({ horarios: (data || []).map(normalizar) })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// POST /api/horarios — Crear bloque en el calendario
async function crear(req, res) {
  const {
    estudiante_id, id_estudiante,
    maestro_id,    id_maestro,
    dia, hora_inicio, hora_fin, hora_final,
    tipo, duracion, alberca
  } = req.body

  const estId   = id_estudiante || estudiante_id
  const maestId = id_maestro   || maestro_id
  const horaFin = hora_final   || hora_fin

  if (!estId || !maestId || !dia || !hora_inicio)
    return res.status(400).json({ message: 'Faltan datos requeridos.' })

  if (!alberca || (alberca !== 1 && alberca !== 2))
    return res.status(400).json({ message: 'Debes seleccionar alberca 1 o 2.' })

  const tipoBloque  = TIPOS_VALIDOS.includes(tipo) ? tipo : 'individual'
  const duracionMin = parseInt(duracion) || 30
  const [hh, mm]    = hora_inicio.split(':').map(Number)
  const newStart    = hh * 60 + mm
  const newEnd      = newStart + duracionMin

  try {
    // Traer todos los bloques del mismo día para validar conflictos
    const { data: existentes } = await supabase
      .from('HorariosAlumnos')
      .select('id_horario, id_maestro, id_estudiante, hora_inicio, duracion, tipo, alberca')
      .eq('dia', dia)

    const esGrupalOMatros = (t) => t === 'grupal' || t === 'matros'

    if (existentes && existentes.length > 0) {
      for (const ex of existentes) {
        const [exH, exM] = ex.hora_inicio.split(':').map(Number)
        const exStart    = exH * 60 + exM
        const exEnd      = exStart + (ex.duracion || 30)

        if (!(newStart < exEnd && exStart < newEnd)) continue // no se solapan, ignorar

        // Conflicto con el mismo maestro — excepción: unirse al mismo grupo (grupal o matros)
        if (parseInt(ex.id_maestro) === parseInt(maestId)) {
          if (esGrupalOMatros(tipoBloque) && tipoBloque === ex.tipo && exStart === newStart && ex.alberca === parseInt(alberca)) {
            // Verificar que el estudiante no esté ya en ese grupo
            if (parseInt(ex.id_estudiante) === parseInt(estId)) {
              return res.status(409).json({ message: 'El alumno ya está inscrito en ese grupo.' })
            }
            continue
          }
          return res.status(409).json({ message: 'El maestro ya tiene una clase en ese horario.' })
        }

        // Conflicto de alberca — excepción: unirse al mismo grupo en la misma alberca y hora exacta
        if (ex.alberca === parseInt(alberca)) {
          if (esGrupalOMatros(tipoBloque) && tipoBloque === ex.tipo && exStart === newStart) continue
          return res.status(409).json({ message: `La alberca ${alberca} ya está ocupada en ese horario.` })
        }
      }
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
        duracion:      duracionMin,
        alberca:       parseInt(alberca)
      }])
      .select()
      .single()

    if (error) return res.status(500).json({ message: error.message })

    res.status(201).json({ message: 'Horario asignado.', horario: normalizar(data) })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// PATCH /api/horarios/:id — Modificar un bloque
async function actualizar(req, res) {
  const { id } = req.params
  const { dia, hora_inicio, hora_fin, hora_final, tipo, duracion, alberca } = req.body
  const horaFin = hora_final || hora_fin

  const updates = {}
  if (dia)                                         updates.dia         = dia
  if (hora_inicio)                                 updates.hora_inicio = hora_inicio
  if (horaFin)                                     updates.hora_final  = horaFin
  if (tipo && TIPOS_VALIDOS.includes(tipo))        updates.tipo        = tipo
  if (duracion)                                    updates.duracion    = parseInt(duracion)
  if (alberca && (alberca === 1 || alberca === 2)) updates.alberca     = parseInt(alberca)

  try {
    const { data, error } = await supabase
      .from('HorariosAlumnos')
      .update(updates)
      .eq('id_horario', id)
      .select()
      .single()
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Horario actualizado.', horario: normalizar(data) })
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

module.exports = { porMaestro, porEstudiante, crear, actualizar, eliminar, eliminarPorEstudiante, global }