// ================================
// RUTAS — Sin cambios estructurales
// Las rutas de maestros, clases, estudiantes, pagos y auth
// NO requieren modificaciones porque los cambios son solo
// internos en los controllers (nombres de tablas y columnas).
//
// El único archivo de rutas que cambia es:
//   horarios.routes.js → inscripciones.routes.js
//
// En app.js / server.js, actualizar el require:
//
//   ANTES:
//     const horariosRoutes = require('./routes/horarios.routes')
//     app.use('/api/horarios', horariosRoutes)
//
//   DESPUÉS:
//     const inscripcionesRoutes = require('./routes/inscripciones.routes')
//     app.use('/api/horarios', inscripcionesRoutes)  ← misma URL, distinto archivo
//
// Esto mantiene compatibilidad total con el frontend sin tocar
// ningún fetch('/api/horarios/...) existente.
// ================================
