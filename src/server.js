// ================================
// server.js — Punto de entrada del backend
// CEA Sistema de Gestión
// ================================

require('dotenv').config()
const express        = require('express')
const path           = require('path')
const { iniciarCron } = require('./cron/cargos.cron')

const app  = express()
const PORT = process.env.PORT || 3000

// ─── Middlewares ───────────────────────────────────────────────────────────
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ─── Archivos estáticos del frontend ──────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')))

// ─── Rutas de la API ──────────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth.routes'))
app.use('/api/maestros',    require('./routes/maestros.routes'))
app.use('/api/estudiantes', require('./routes/estudiantes.routes'))
app.use('/api/horarios',    require('./routes/horarios.routes'))
app.use('/api/pagos',       require('./routes/pagos.routes'))

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
