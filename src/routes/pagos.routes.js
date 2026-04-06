// ================================
// pagos.routes.js — CEA Sistema de Gestión
// ================================

const express = require('express')
const router  = express.Router()
const { listar, contarPendientes, actualizar, generar, crear } = require('../controllers/pagos.controller')

router.get('/',                   listar)
router.get('/pendientes',         contarPendientes)
router.post('/',                  crear)
router.post('/generar',           generar)
router.patch('/:id',              actualizar)

module.exports = router