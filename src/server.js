// ================================
// server.js — Punto de entrada del backend
// CEA Sistema de Gestión
// ================================

require('dotenv').config()
const express = require('express')
const path    = require('path')

const app  = express()
const PORT = process.env.PORT || 3000

// --- Middlewares ---
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// --- Archivos estáticos del frontend ---
app.use(express.static(path.join(__dirname, '../public')))

// --- Rutas de la API ---
const authRoutes         = require('./routes/auth.routes')
const maestrosRoutes     = require('./routes/maestros.routes')
const clasesRoutes       = require('./routes/clases.routes')
const estudiantesRoutes  = require('./routes/estudiantes.routes')
const horariosRoutes     = require('./routes/inscripciones.routes')
const pagosRoutes        = require('./routes/pagos.routes')

app.use('/api/auth',        authRoutes)
app.use('/api/maestros',    maestrosRoutes)
app.use('/api/clases',      clasesRoutes)
app.use('/api/estudiantes', estudiantesRoutes)
app.use('/api/horarios',    horariosRoutes)
app.use('/api/pagos',       pagosRoutes)

// --- Ruta de salud del servidor ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'Servidor corriendo ✅', puerto: PORT })
})

// --- Iniciar servidor ---
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`)
})