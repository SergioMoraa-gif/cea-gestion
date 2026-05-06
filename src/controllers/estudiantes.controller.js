// ================================
// estudiantes.controller.js
// CEA Sistema de Gestión — Esquema nuevo sin Clases
// ================================

const supabase = require('../config/db')

// GET /api/estudiantes
async function listar(req, res) {
  try {
    const { data, error } = await supabase
      .from('Estudiantes')
      .select('*')
      .order('nombre', { ascending: true })
    if (error) return res.status(500).json({ message: error.message })
    res.json({ estudiantes: data })
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

// GET /api/estudiantes/:id
async function obtener(req, res) {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('Estudiantes')
      .select('*')
      .eq('id_estudiante', id)
      .single()
    if (error) return res.status(404).json({ message: 'Estudiante no encontrado.' })
    res.json({ estudiante: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// POST /api/estudiantes
async function crear(req, res) {
  const { nombre, folio, telefono, precio_mensual } = req.body
  if (!nombre) return res.status(400).json({ message: 'El nombre es requerido.' })
  try {
    const { data, error } = await supabase
      .from('Estudiantes')
      .insert([{
        nombre,
        folio:          folio          || null,
        telefono:       telefono       || null,
        precio_mensual: precio_mensual || 0,
        activo:         true
      }])
      .select()
      .single()
    if (error) {
      if (error.code === '23505' && error.message.includes('folio'))
        return res.status(409).json({ message: 'El folio ya está en uso. Elige un folio diferente.' })
      return res.status(500).json({ message: error.message })
    }
    res.status(201).json({ message: 'Estudiante creado.', estudiante: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// PUT /api/estudiantes/:id
async function actualizar(req, res) {
  const { id } = req.params
  const { nombre, folio, telefono, precio_mensual } = req.body
  if (!nombre) return res.status(400).json({ message: 'El nombre es requerido.' })
  try {
    const { data, error } = await supabase
      .from('Estudiantes')
      .update({
        nombre,
        folio:          folio          || null,
        telefono:       telefono       || null,
        precio_mensual: precio_mensual !== undefined ? precio_mensual : 0
      })
      .eq('id_estudiante', id)
      .select()
      .single()
    if (error) {
      if (error.code === '23505' && error.message.includes('folio'))
        return res.status(409).json({ message: 'El folio ya está en uso. Elige un folio diferente.' })
      return res.status(500).json({ message: error.message })
    }
    res.json({ message: 'Estudiante actualizado.', estudiante: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// PATCH /api/estudiantes/:id/baja
async function darBaja(req, res) {
  const { id } = req.params
  try {
    // Eliminar todos los horarios del alumno.
    // Si era el único en un grupo, el grupo desaparece.
    // Si había más alumnos en el grupo, sus filas permanecen.
    const { error: errH } = await supabase
      .from('HorariosAlumnos').delete().eq('id_estudiante', id)
    if (errH) return res.status(500).json({ message: errH.message })

    const { error } = await supabase
      .from('Estudiantes').update({ activo: false }).eq('id_estudiante', id)
    if (error) return res.status(500).json({ message: error.message })

    res.json({ message: 'Estudiante dado de baja.' })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// PATCH /api/estudiantes/:id/reactivar
async function reactivar(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('Estudiantes').update({ activo: true }).eq('id_estudiante', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Estudiante reactivado.' })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

// DELETE /api/estudiantes/:id
async function eliminar(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('Estudiantes').delete().eq('id_estudiante', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Estudiante eliminado.' })
  } catch (err) { res.status(500).json({ message: 'Error interno.' }) }
}

module.exports = { listar, obtener, crear, actualizar, darBaja, reactivar, eliminar, contar }