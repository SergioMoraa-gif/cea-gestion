// ================================
// server.js — Punto de entrada del backend
// CEA Sistema de Gestión
// ================================

require('dotenv').config()
const express        = require('express')
const path           = require('path')
const { iniciarCron } = require('./cron/cargos.cron')
const { requireAuth } = require('./middlewares/auth.middleware')

const app  = express()
const PORT = process.env.PORT || 3000

// ─── Middlewares ───────────────────────────────────────────────────────────
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ─── Archivos estáticos del frontend ──────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')))

// ─── Rutas de la API ──────────────────────────────────────────────────────
// /api/auth maneja su propia protección por ruta (login/logout quedan
// públicos, gestión de usuarios exige sesión — ver auth.routes.js).
// El resto de la API exige sesión válida en todos sus endpoints.
app.use('/api/auth',        require('./routes/auth.routes'))
app.use('/api/maestros',    requireAuth, require('./routes/maestros.routes'))
app.use('/api/estudiantes', requireAuth, require('./routes/estudiantes.routes'))
app.use('/api/horarios',    requireAuth, require('./routes/horarios.routes'))
app.use('/api/pagos',       requireAuth, require('./routes/pagos.routes'))

// ─── Health check ─────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', puerto: PORT })
})

// ─── Cron de cargos automáticos ───────────────────────────────────────────
iniciarCron()

// ─── Iniciar servidor ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`)
})
