// ================================
// horarios.routes.js
// CEA Sistema de Gestión
// ================================

const express = require('express')
const router  = express.Router()
const { porMaestro, porEstudiante, crear, eliminar, eliminarPorEstudiante } = require('../controllers/horarios.controller')

router.get('/maestro/:id',     porMaestro)
router.get('/estudiante/:id',  porEstudiante)
router.post('/',               crear)
router.delete('/estudiante/:id', eliminarPorEstudiante)
router.delete('/:id',          eliminar)

module.exports = router