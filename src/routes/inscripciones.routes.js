// ================================
// inscripciones.routes.js
// CEA Sistema de Gestión — Esquema nuevo
// Reemplaza horarios.routes.js
// Las URLs siguen siendo /api/horarios para no romper el frontend
// ================================

const express = require('express')
const router  = express.Router()
const {
  porMaestro, porEstudiante, crear, eliminar, eliminarPorEstudiante
} = require('../controllers/inscripciones.controller')

router.get('/maestro/:id',       porMaestro)
router.get('/estudiante/:id',    porEstudiante)
router.post('/',                 crear)
router.delete('/estudiante/:id', eliminarPorEstudiante)
router.delete('/:id',            eliminar)

module.exports = router
