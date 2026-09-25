// ================================
// calendario.routes.js — CEA Sistema de Gestión
// ================================

const express = require('express')
const router  = express.Router()
const { previsualizarLimpieza, limpiarCalendario } = require('../controllers/calendario.controller')

router.get('/limpiar/preview', previsualizarLimpieza)
router.post('/limpiar',        limpiarCalendario)

module.exports = router
