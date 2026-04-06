// ================================
// estudiantes.controller.js
// CEA Sistema de Gestión — Esquema nuevo
// ================================

const supabase = require('../config/db')

// GET /api/estudiantes
// Devuelve estudiantes con su clase e id_maestro resuelto via join
async function listar(req, res) {
  try {
    const { data, error } = await supabase
      .from('Estudiantes')
      .select(`
        *,
        EstudiantesClases (
          id_registro,
          id_clase,
          Clases (
            id_clase,
            nombre,
            tipo,
            modalidad,
            costo_mensual,
            id_maestro
          )
        )
      `)
      .order('nombre', { ascending: true })

    if (error) return res.status(500).json({ message: error.message })

    // Aplanar para que el frontend reciba id_clase, id_maestro, etc.
    // compatibles con la estructura anterior
    const estudiantes = data.map(e => {
      const inscripcion = e.EstudiantesClases?.[0] || null
      const clase       = inscripcion?.Clases || null
      return {
        ...e,
        id_registro: inscripcion?.id_registro || null,
        id_clase:    clase?.id_clase    || null,
        clase_id:    clase?.id_clase    || null,   // alias para compatibilidad frontend
        id_maestro:  clase?.id_maestro  || null,
        maestro_id:  clase?.id_maestro  || null,   // alias para compatibilidad frontend
        clase_nombre:     clase?.nombre     || null,
        clase_tipo:       clase?.tipo       || null,
        clase_modalidad:  clase?.modalidad  || null,
        EstudiantesClases: undefined  // limpiar objeto anidado
      }
    })

    res.json({ estudiantes })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// GET /api/estudiantes/:id
async function obtener(req, res) {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('Estudiantes')
      .select(`
        *,
        EstudiantesClases (
          id_registro,
          id_clase,
          Clases (
            id_clase,
            nombre,
            tipo,
            modalidad,
            costo_mensual,
            id_maestro
          )
        )
      `)
      .eq('id_estudiante', id)
      .single()

    if (error) return res.status(404).json({ message: 'Estudiante no encontrado.' })

    const inscripcion = data.EstudiantesClases?.[0] || null
    const clase       = inscripcion?.Clases || null
    const estudiante  = {
      ...data,
      id_registro: inscripcion?.id_registro || null,
      id_clase:    clase?.id_clase    || null,
      clase_id:    clase?.id_clase    || null,
      id_maestro:  clase?.id_maestro  || null,
      maestro_id:  clase?.id_maestro  || null,
      EstudiantesClases: undefined
    }

    res.json({ estudiante })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// POST /api/estudiantes
// 1. Crea el estudiante
// 2. Crea inscripción en EstudiantesClases
// 3. Genera primer cargo en Pagos
async function crear(req, res) {
  const { nombre, folio, genero, fecha_nacimiento, id_clase } = req.body

  // Soportar también clase_id por compatibilidad con frontend anterior
  const claseId = id_clase || req.body.clase_id

  if (!nombre) return res.status(400).json({ message: 'El nombre es requerido.' })

  try {
    // 1. Crear estudiante
    const { data: estudiante, error: errEst } = await supabase
      .from('Estudiantes')
      .insert([{ nombre, folio, genero: genero || null, fecha_nacimiento: fecha_nacimiento || null, activo: true }])
      .select()
      .single()

    if (errEst) return res.status(500).json({ message: errEst.message })

    let id_registro = null

    if (claseId) {
      // 2. Crear inscripción en EstudiantesClases
      const { data: inscripcion, error: errInsc } = await supabase
        .from('EstudiantesClases')
        .insert([{ id_estudiante: estudiante.id_estudiante, id_clase: parseInt(claseId) }])
        .select()
        .single()

      if (errInsc) {
        console.error('Error creando inscripción:', errInsc.message)
      } else {
        id_registro = inscripcion.id_registro

        // 3. Obtener costo de la clase y generar primer cargo
        const { data: clase } = await supabase
          .from('Clases')
          .select('costo_mensual')
          .eq('id_clase', parseInt(claseId))
          .single()

        const monto = clase?.costo_mensual || 0
        const hoy   = new Date()
        const mes   = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`

        const { error: errPago } = await supabase
          .from('Pagos')
          .insert([{
            id_estudiante: estudiante.id_estudiante,
            id_clase:      parseInt(claseId),
            mes,
            monto,
            estado: 'pendiente'
          }])

        if (errPago) console.error('Error generando cargo inicial:', errPago.message)
      }
    }

    res.status(201).json({
      message: 'Estudiante creado.',
      estudiante: {
        ...estudiante,
        id_registro,
        id_clase:   claseId ? parseInt(claseId) : null,
        clase_id:   claseId ? parseInt(claseId) : null
      }
    })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// PUT /api/estudiantes/:id
// Actualiza datos básicos del estudiante y su inscripción de clase
async function actualizar(req, res) {
  const { id } = req.params
  const { nombre, folio, genero, fecha_nacimiento, id_clase } = req.body
  const claseId = id_clase || req.body.clase_id

  if (!nombre) return res.status(400).json({ message: 'El nombre es requerido.' })

  try {
    // Actualizar datos del estudiante
    const { data: estudiante, error: errEst } = await supabase
      .from('Estudiantes')
      .update({ nombre, folio, genero: genero || null, fecha_nacimiento: fecha_nacimiento || null })
      .eq('id_estudiante', id)
      .select()
      .single()

    if (errEst) return res.status(500).json({ message: errEst.message })

    // Si se envía nueva clase, actualizar inscripción
    if (claseId) {
      // Verificar si ya existe inscripción
      const { data: inscExistente } = await supabase
        .from('EstudiantesClases')
        .select('id_registro')
        .eq('id_estudiante', id)

      if (inscExistente && inscExistente.length > 0) {
        // Actualizar inscripción existente
        await supabase
          .from('EstudiantesClases')
          .update({ id_clase: parseInt(claseId) })
          .eq('id_estudiante', id)
      } else {
        // Crear nueva inscripción
        await supabase
          .from('EstudiantesClases')
          .insert([{ id_estudiante: parseInt(id), id_clase: parseInt(claseId) }])
      }
    }

    res.json({ message: 'Estudiante actualizado.', estudiante })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// PATCH /api/estudiantes/:id/baja
async function darBaja(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('Estudiantes')
      .update({ activo: false })
      .eq('id_estudiante', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Estudiante dado de baja.' })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// PATCH /api/estudiantes/:id/reactivar
async function reactivar(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('Estudiantes')
      .update({ activo: true })
      .eq('id_estudiante', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Estudiante reactivado.' })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// DELETE /api/estudiantes/:id
async function eliminar(req, res) {
  const { id } = req.params
  try {
    // Las FK con CASCADE en Supabase borrarán EstudiantesClases y HorariosAlumnos
    // Si no hay CASCADE configurado, borrar manualmente:
    await supabase.from('HorariosAlumnos')
      .delete()
      .in('id_registro',
        (await supabase.from('EstudiantesClases').select('id_registro').eq('id_estudiante', id))
          .data?.map(r => r.id_registro) || []
      )
    await supabase.from('EstudiantesClases').delete().eq('id_estudiante', id)
    await supabase.from('Pagos').delete().eq('id_estudiante', id)

    const { error } = await supabase
      .from('Estudiantes')
      .delete()
      .eq('id_estudiante', id)

    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Estudiante eliminado.' })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// GET /api/estudiantes/count
async function contar(req, res) {
  try {
    const { count, error } = await supabase
      .from('Estudiantes')
      .select('*', { count: 'exact', head: true })
      .eq('activo', true)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ total: count })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

module.exports = { listar, obtener, crear, actualizar, darBaja, reactivar, eliminar, contar }
