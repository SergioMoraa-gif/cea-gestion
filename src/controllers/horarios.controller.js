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

        // Una alberca puede tener varios maestros al mismo tiempo — sin límite de ocupación.
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

// PATCH /api/horarios/:id — Modificar un bloque (también usado para moverlo de día/hora/maestro)
async function actualizar(req, res) {
  const { id } = req.params
  const {
    dia, hora_inicio, hora_fin, hora_final, tipo, duracion, alberca,
    maestro_id, id_maestro
  } = req.body
  const horaFin = hora_final || hora_fin
  const maestId = id_maestro || maestro_id

  try {
    const { data: actual, error: errActual } = await supabase
      .from('HorariosAlumnos')
      .select('*')
      .eq('id_horario', id)
      .single()
    if (errActual || !actual) return res.status(404).json({ message: 'Horario no encontrado.' })

    const updates = {}
    if (dia)                                         updates.dia         = dia
    if (hora_inicio)                                 updates.hora_inicio = hora_inicio
    if (horaFin)                                     updates.hora_final  = horaFin
    if (tipo && TIPOS_VALIDOS.includes(tipo))        updates.tipo        = tipo
    if (duracion)                                    updates.duracion    = parseInt(duracion)
    if (alberca && (alberca === 1 || alberca === 2)) updates.alberca     = parseInt(alberca)
    if (maestId)                                      updates.id_maestro  = parseInt(maestId)

    // Valores efectivos que va a tener el registro después del update
    const diaFinal      = updates.dia         || actual.dia
    const horaFinal     = updates.hora_inicio || actual.hora_inicio
    const tipoFinal     = updates.tipo        || actual.tipo
    const albercaFinal  = updates.alberca     || actual.alberca
    const duracionFinal = updates.duracion    || actual.duracion || 30
    const maestroFinal  = updates.id_maestro  || actual.id_maestro

    const [hh, mm] = horaFinal.split(':').map(Number)
    const newStart = hh * 60 + mm
    const newEnd   = newStart + duracionFinal

    // Traer los demás bloques del día destino para validar conflictos (igual que al crear)
    const { data: existentes } = await supabase
      .from('HorariosAlumnos')
      .select('id_horario, id_maestro, id_estudiante, hora_inicio, duracion, tipo, alberca')
      .eq('dia', diaFinal)
      .neq('id_horario', id)

    const esGrupalOMatros = (t) => t === 'grupal' || t === 'matros'

    if (existentes && existentes.length > 0) {
      for (const ex of existentes) {
        const [exH, exM] = ex.hora_inicio.split(':').map(Number)
        const exStart    = exH * 60 + exM
        const exEnd      = exStart + (ex.duracion || 30)

        if (!(newStart < exEnd && exStart < newEnd)) continue // no se solapan, ignorar

        if (parseInt(ex.id_maestro) === parseInt(maestroFinal)) {
          if (esGrupalOMatros(tipoFinal) && tipoFinal === ex.tipo && exStart === newStart && ex.alberca === parseInt(albercaFinal)) {
            if (parseInt(ex.id_estudiante) === parseInt(actual.id_estudiante)) {
              return res.status(409).json({ message: 'El alumno ya está inscrito en ese grupo.' })
            }
            continue
          }
          return res.status(409).json({ message: 'El maestro ya tiene una clase en ese horario.' })
        }
      }
    }

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