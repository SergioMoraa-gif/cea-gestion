// ================================
// clases.controller.js
// CEA Sistema de Gestión — Esquema nuevo
// ================================

const supabase = require('../config/db')

// GET /api/clases
async function listar(req, res) {
  try {
    const { data, error } = await supabase
      .from('Clases')
      .select('*')
      .order('nombre', { ascending: true })
    if (error) return res.status(500).json({ message: error.message })
    res.json({ clases: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// GET /api/clases/:id
async function obtener(req, res) {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('Clases')
      .select('*')
      .eq('id_clase', id)
      .single()
    if (error) return res.status(404).json({ message: 'Clase no encontrada.' })
    res.json({ clase: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// POST /api/clases
async function crear(req, res) {
  const { nombre, costo_mensual, tipo, modalidad, id_maestro } = req.body
  if (!nombre) return res.status(400).json({ message: 'El nombre es requerido.' })
  try {
    const { data, error } = await supabase
      .from('Clases')
      .insert([{ nombre, costo_mensual, tipo, modalidad, id_maestro: id_maestro || null, activa: true }])
      .select()
      .single()
    if (error) return res.status(500).json({ message: error.message })
    res.status(201).json({ message: 'Clase creada.', clase: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// PUT /api/clases/:id
async function actualizar(req, res) {
  const { id } = req.params
  const { nombre, costo_mensual, tipo, modalidad, id_maestro } = req.body
  if (!nombre) return res.status(400).json({ message: 'El nombre es requerido.' })
  try {
    const { data, error } = await supabase
      .from('Clases')
      .update({ nombre, costo_mensual, tipo, modalidad, id_maestro: id_maestro || null })
      .eq('id_clase', id)
      .select()
      .single()
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Clase actualizada.', clase: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// PATCH /api/clases/:id — desactivar
async function desactivar(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('Clases')
      .update({ activa: false })
      .eq('id_clase', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Clase desactivada.' })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// PATCH /api/clases/:id/reactivar
async function reactivar(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('Clases')
      .update({ activa: true })
      .eq('id_clase', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Clase reactivada.' })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// DELETE /api/clases/:id
async function eliminar(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('Clases')
      .delete()
      .eq('id_clase', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Clase eliminada.' })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// GET /api/clases/count
async function contar(req, res) {
  try {
    const { count, error } = await supabase
      .from('Clases')
      .select('*', { count: 'exact', head: true })
      .eq('activa', true)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ total: count })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

module.exports = { listar, obtener, crear, actualizar, desactivar, reactivar, eliminar, contar }
