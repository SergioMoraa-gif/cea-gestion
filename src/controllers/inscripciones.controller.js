// ================================
// inscripciones.controller.js
// CEA Sistema de Gestión — Esquema nuevo
// Reemplaza horarios.controller.js
// Maneja: EstudiantesClases + HorariosAlumnos
// ================================

const supabase = require('../config/db')

// GET /api/inscripciones/maestro/:id
// Obtiene todos los HorariosAlumnos del maestro vía:
//   HorariosAlumnos → EstudiantesClases → Clases → Maestros
async function porMaestro(req, res) {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('HorariosAlumnos')
      .select(`
        *,
        EstudiantesClases (
          id_registro,
          id_estudiante,
          id_clase,
          Clases (
            id_clase,
            nombre,
            tipo,
            modalidad,
            id_maestro
          )
        )
      `)
      .order('dia').order('hora_inicio')

    if (error) return res.status(500).json({ message: error.message })

    // Filtrar por maestro y aplanar para compatibilidad con el calendario
    const horarios = data
      .filter(h => h.EstudiantesClases?.Clases?.id_maestro === parseInt(id))
      .map(h => ({
        id:              h.id_horario,
        id_horario:      h.id_horario,
        id_registro:     h.id_registro,
        id_estudiante:   h.EstudiantesClases?.id_estudiante || null,
        estudiante_id:   h.EstudiantesClases?.id_estudiante || null, // alias
        id_clase:        h.EstudiantesClases?.id_clase || null,
        clase_id:        h.EstudiantesClases?.id_clase || null,       // alias
        maestro_id:      h.EstudiantesClases?.Clases?.id_maestro || null,
        dia:             h.dia,
        hora_inicio:     h.hora_inicio,
        hora_fin:        h.hora_final,   // alias: hora_final → hora_fin (frontend usa hora_fin)
        hora_final:      h.hora_final
      }))

    res.json({ horarios })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// GET /api/inscripciones/estudiante/:id
// Horarios de un estudiante específico
async function porEstudiante(req, res) {
  const { id } = req.params
  try {
    // Obtener id_registro(s) del estudiante
    const { data: inscripciones, error: errInsc } = await supabase
      .from('EstudiantesClases')
      .select('id_registro')
      .eq('id_estudiante', id)

    if (errInsc) return res.status(500).json({ message: errInsc.message })
    if (!inscripciones || inscripciones.length === 0) return res.json({ horarios: [] })

    const ids = inscripciones.map(i => i.id_registro)

    const { data, error } = await supabase
      .from('HorariosAlumnos')
      .select('*')
      .in('id_registro', ids)
      .order('dia').order('hora_inicio')

    if (error) return res.status(500).json({ message: error.message })

    const horarios = data.map(h => ({
      ...h,
      id:        h.id_horario,
      hora_fin:  h.hora_final
    }))

    res.json({ horarios })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// POST /api/inscripciones
// Asigna un bloque horario a un alumno ya inscrito en una clase
async function crear(req, res) {
  const { estudiante_id, maestro_id, clase_id, dia, hora_inicio, hora_fin } = req.body

  if (!estudiante_id || !maestro_id || !dia || !hora_inicio)
    return res.status(400).json({ message: 'Faltan datos requeridos.' })

  try {
    // Buscar la inscripción (EstudiantesClases) del estudiante en esa clase
    const { data: inscripcion, error: errInsc } = await supabase
      .from('EstudiantesClases')
      .select('id_registro')
      .eq('id_estudiante', estudiante_id)
      .eq('id_clase', clase_id)
      .single()

    if (errInsc || !inscripcion)
      return res.status(404).json({ message: 'El estudiante no está inscrito en esa clase.' })

    // Verificar conflicto: ¿ya hay un horario a esa hora para el maestro ese día?
    const { data: conflicto } = await supabase
      .from('HorariosAlumnos')
      .select(`
        id_horario,
        EstudiantesClases ( Clases ( id_maestro, tipo ) )
      `)
      .eq('dia', dia)
      .eq('hora_inicio', hora_inicio)

    if (conflicto && conflicto.length > 0) {
      const mismoMaestro = conflicto.filter(
        h => h.EstudiantesClases?.Clases?.id_maestro === parseInt(maestro_id)
      )
      if (mismoMaestro.length > 0) {
        const tipoClase = mismoMaestro[0].EstudiantesClases?.Clases?.tipo
        if (tipoClase !== 'grupal') {
          return res.status(409).json({ message: 'Este horario ya está ocupado para una clase individual.' })
        }
      }
    }

    // Crear el bloque en HorariosAlumnos
    const { data, error } = await supabase
      .from('HorariosAlumnos')
      .insert([{
        id_registro: inscripcion.id_registro,
        dia,
        hora_inicio,
        hora_final: hora_fin   // frontend envía hora_fin → guardamos como hora_final
      }])
      .select()
      .single()

    if (error) return res.status(500).json({ message: error.message })

    res.status(201).json({
      message: 'Horario asignado.',
      horario: { ...data, id: data.id_horario, hora_fin: data.hora_final }
    })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// DELETE /api/inscripciones/estudiante/:id
// Borra todos los HorariosAlumnos de un estudiante
async function eliminarPorEstudiante(req, res) {
  const { id } = req.params
  try {
    const { data: inscripciones } = await supabase
      .from('EstudiantesClases')
      .select('id_registro')
      .eq('id_estudiante', id)

    if (inscripciones && inscripciones.length > 0) {
      const ids = inscripciones.map(i => i.id_registro)
      const { error } = await supabase
        .from('HorariosAlumnos')
        .delete()
        .in('id_registro', ids)
      if (error) return res.status(500).json({ message: error.message })
    }

    res.json({ message: 'Horarios del estudiante eliminados.' })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// DELETE /api/inscripciones/:id
// Borra un HorariosAlumnos específico por id_horario
async function eliminar(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('HorariosAlumnos')
      .delete()
      .eq('id_horario', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Horario eliminado.' })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

module.exports = { porMaestro, porEstudiante, crear, eliminar, eliminarPorEstudiante }
