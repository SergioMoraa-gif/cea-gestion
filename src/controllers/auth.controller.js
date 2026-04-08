// ================================
// auth.controller.js — Lógica de autenticación y gestión de usuarios
// CEA Sistema de Gestión
// ================================

const supabase = require('../config/db')

// POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ message: 'Correo y contraseña son requeridos.' })

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user)
      return res.status(401).json({ message: 'Credenciales incorrectas. Intenta de nuevo.' })

    return res.status(200).json({
      message: 'Login exitoso',
      token: data.session.access_token,
      user: { id: data.user.id, email: data.user.email }
    })
  } catch (err) {
    return res.status(500).json({ message: 'Error interno del servidor.' })
  }
}

// POST /api/auth/logout
async function logout(req, res) {
  try {
    await supabase.auth.signOut()
    return res.status(200).json({ message: 'Sesión cerrada correctamente.' })
  } catch (err) {
    return res.status(500).json({ message: 'Error al cerrar sesión.' })
  }
}

// GET /api/auth/usuarios — Listar todos los usuarios del sistema
async function listarUsuarios(req, res) {
  try {
    const { data, error } = await supabase.auth.admin.listUsers()
    if (error) return res.status(500).json({ message: error.message })

    const usuarios = (data.users || []).map(u => ({
      id:           u.id,
      email:        u.email,
      created_at:   u.created_at,
      last_sign_in: u.last_sign_in_at,
      activo:       !u.banned_until
    }))

    res.json({ usuarios })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// POST /api/auth/usuarios — Crear un nuevo usuario
async function crearUsuario(req, res) {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ message: 'Correo y contraseña son requeridos.' })
  if (password.length < 6)
    return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' })

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true   // confirma el correo automáticamente
    })

    if (error) {
      if (error.message.includes('already been registered'))
        return res.status(409).json({ message: 'Ese correo ya está registrado.' })
      return res.status(500).json({ message: error.message })
    }

    res.status(201).json({
      message: 'Usuario creado correctamente.',
      usuario: { id: data.user.id, email: data.user.email }
    })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// PATCH /api/auth/usuarios/:id/password — Cambiar contraseña
async function cambiarPassword(req, res) {
  const { id } = req.params
  const { password } = req.body
  if (!password || password.length < 6)
    return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' })

  try {
    const { error } = await supabase.auth.admin.updateUserById(id, { password })
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Contraseña actualizada.' })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

// DELETE /api/auth/usuarios/:id — Eliminar usuario
async function eliminarUsuario(req, res) {
  const { id } = req.params
  try {
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) return res.status(500).json({ message: error.message })
    res.json({ message: 'Usuario eliminado.' })
  } catch (err) {
    res.status(500).json({ message: 'Error interno.' })
  }
}

module.exports = { login, logout, listarUsuarios, crearUsuario, cambiarPassword, eliminarUsuario }
