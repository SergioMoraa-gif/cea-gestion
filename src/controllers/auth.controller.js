// ================================
// auth.controller.js — Lógica de autenticación
// CEA Sistema de Gestión
// ================================

const supabase = require('../config/db')

// POST /api/auth/login
async function login(req, res) {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'Correo y contraseña son requeridos.' })
  }

  try {
    // Autenticar con Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error || !data.user) {
      return res.status(401).json({ message: 'Credenciales incorrectas. Intenta de nuevo.' })
    }

    return res.status(200).json({
      message: 'Login exitoso',
      token: data.session.access_token,
      user: {
        id:    data.user.id,
        email: data.user.email
      }
    })

  } catch (err) {
    console.error('Error en login:', err)
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

module.exports = { login, logout }
