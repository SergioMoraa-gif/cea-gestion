// ================================
// auth.middleware.js — Verificación de sesión
// CEA Sistema de Gestión
// ================================
//
// Exige un token válido de Supabase Auth (el mismo que el frontend ya
// guarda en sessionStorage y manda como "Authorization: Bearer <token>"
// en cada fetch — ver public/js/*.js). Sin este middleware, cualquier
// endpoint de la API quedaba abierto a internet sin necesidad de login.

const supabase = require('../config/db')

async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null

  if (!token) {
    return res.status(401).json({ message: 'No autorizado. Inicia sesión.' })
  }

  try {
    // Verifica el JWT contra Supabase Auth (no consulta ninguna tabla de datos).
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) {
      return res.status(401).json({ message: 'Sesión inválida o expirada. Inicia sesión de nuevo.' })
    }
    req.user = data.user
    next()
  } catch (err) {
    return res.status(401).json({ message: 'No se pudo verificar la sesión.' })
  }
}

module.exports = { requireAuth }
