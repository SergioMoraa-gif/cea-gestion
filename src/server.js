// ================================
// server.js — Punto de entrada del backend
// CEA Sistema de Gestión
// ================================

require('dotenv').config()
const express  = require('express')
const path     = require('path')
const cron     = require('node-cron')
const supabase = require('./config/db')

const app  = express()
const PORT = process.env.PORT || 3000

// --- Middlewares ---
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// --- Archivos estáticos del frontend ---
app.use(express.static(path.join(__dirname, '../public')))

// --- Rutas de la API ---
const authRoutes        = require('./routes/auth.routes')
const maestrosRoutes    = require('./routes/maestros.routes')
const estudiantesRoutes = require('./routes/estudiantes.routes')
const horariosRoutes    = require('./routes/horarios.routes')
const pagosRoutes       = require('./routes/pagos.routes')

app.use('/api/auth',        authRoutes)
app.use('/api/maestros',    maestrosRoutes)
app.use('/api/estudiantes', estudiantesRoutes)
app.use('/api/horarios',    horariosRoutes)
app.use('/api/pagos',       pagosRoutes)

// --- Health check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'Servidor corriendo ✅', puerto: PORT })
})

// --- Cron: cargos automáticos mensuales ---
// Corre todos los días a las 8am (hora México).
// Si hoy es el día de cobro del alumno (basado en su primera inscripción)
// y no tiene cargo para el mes actual → lo crea en Pendiente.
async function generarCargosAutomaticos() {
  const hoy    = new Date()
  const diaHoy = hoy.getDate()
  const anio   = hoy.getFullYear()
  const mes    = hoy.getMonth() + 1
  const mesActual = `${anio}-${String(mes).padStart(2, '0')}-01`

  try {
    const { data: estudiantes } = await supabase
      .from('Estudiantes')
      .select('id_estudiante, precio_mensual')
      .eq('activo', true)

    if (!estudiantes || estudiantes.length === 0) return

    let generados = 0
    for (const est of estudiantes) {
      // Primer cargo del alumno → determina su día de cobro
      const { data: primero } = await supabase
        .from('Pagos')
        .select('fecha_creacion')
        .eq('id_estudiante', est.id_estudiante)
        .order('fecha_creacion', { ascending: true })
        .limit(1)
        .single()

      if (!primero) continue

      // Ajuste: si el mes tiene menos días que el día de cobro, usar el último
      const diaCobro = Math.min(
        new Date(primero.fecha_creacion).getDate(),
        new Date(anio, mes, 0).getDate()
      )

      if (diaHoy !== diaCobro) continue

      // ¿Ya existe cargo para este mes?
      const { data: existe } = await supabase
        .from('Pagos')
        .select('id_pago')
        .eq('id_estudiante', est.id_estudiante)
        .eq('mes', mesActual)
        .maybeSingle()

      if (existe) continue

      await supabase.from('Pagos').insert([{
        id_estudiante: est.id_estudiante,
        mes:    mesActual,
        monto:  est.precio_mensual || 0,
        estado: 'pendiente'
      }])
      generados++
    }

    if (generados > 0)
      console.log(`📋 Cron cargos: ${generados} cargo(s) generado(s) para ${mesActual}`)
  } catch (err) {
    console.error('❌ Error en cron de cargos:', err.message)
  }
}

cron.schedule('0 8 * * *', generarCargosAutomaticos, { timezone: 'America/Mexico_City' })
console.log('🕐 Cron de cargos automáticos activado (diario 8am)')

// --- Iniciar ---
app.listen(PORT, () => {
  console.log(`✅ Servidor corriendo en http://localhost:${PORT}`)
})