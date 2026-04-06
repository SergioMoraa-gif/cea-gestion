// ================================
// clases.routes.js
// CEA Sistema de Gestión
// ================================

const express = require('express')
const router  = express.Router()
const { listar, obtener, crear, actualizar, desactivar, reactivar, eliminar, contar } = require('../controllers/clases.controller')

router.get('/',               listar)
router.get('/count',          contar)
router.get('/:id',            obtener)
router.post('/',              crear)
router.put('/:id',            actualizar)
router.patch('/:id',          desactivar)
router.patch('/:id/reactivar', reactivar)
router.delete('/:id',         eliminar)

module.exports = router