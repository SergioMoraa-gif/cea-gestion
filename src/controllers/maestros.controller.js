// ================================
// maestros.controller.js
// CEA Sistema de Gestión — Esquema nuevo
// ================================

const supabase = require('../config/db')

// GET /api/maestros
async function listar(req, res) {
  try {
    const { data, error } = await supabase
      .from('Maestros')
      .select('*')
      .order('nombre', { ascending: true })
    if (error) return res.status(500).json({ message: error.message })
    res.json({ maestros: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
}

// GET /api/maestros/:id
async function obtener(req, res) {
  const { id } = req.params
  try {
    const { data, error } = await supabase
      .from('Maestros')
      .select('*')
      .eq('id_maestro', id)
      .single()
    if (error) return res.status(404).json({ message: 'Maestro no encontrado.' })
    res.json({ maestro: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
}

// POST /api/maestros
async function crear(req, res) {
  const { nombre, telefono, dias_trabajo } = req.body
  if (!nombre) return res.status(400).json({ message: 'El nombre es requerido.' })
  try {
    const { data, error } = await supabase
      .from('Maestros')
      .insert([{ nombre, telefono, dias_trabajo, activo: true }])
      .select()
      .single()
    if (error) return res.status(500).json({ message: error.message })
    res.status(201).json({ message: 'Maestro creado.', maestro: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
}

// PUT /api/maestros/:id
async function actualizar(req, res) {
  const { id } = req.params
  const { nombre, telefono, dias_trabajo } = req.body
  if (!nombre) return res.status(400).json({ message: 'El nombre es requerido.' })
  try {
    const { data, error } = await supabase
      .from('Maestros')
      .update({ nombre, telefono, dias_trabajo })
      .eq('id_maestro', id)
      .select()
      .single()
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Maestro actualizado.', maestro: data })
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
}

// PATCH /api/maestros/:id/baja
async function darBaja(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('Maestros')
      .update({ activo: false })
      .eq('id_maestro', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Maestro dado de baja.' })
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
}

// PATCH /api/maestros/:id/reactivar
async function reactivar(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('Maestros')
      .update({ activo: true })
      .eq('id_maestro', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Maestro reactivado.' })
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
}

// DELETE /api/maestros/:id
async function eliminar(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase
      .from('Maestros')
      .delete()
      .eq('id_maestro', id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Maestro eliminado.' })
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
}

// GET /api/maestros/count
async function contar(req, res) {
  try {
    const { count, error } = await supabase
      .from('Maestros')
      .select('*', { count: 'exact', head: true })
      .eq('activo', true)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ total: count })
  } catch (err) {
    res.status(500).json({ message: 'Error interno del servidor.' })
  }
}

module.exports = { listar, obtener, crear, actualizar, darBaja, reactivar, eliminar, contar }
