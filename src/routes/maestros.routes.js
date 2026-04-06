// ================================
// maestros.routes.js
// CEA Sistema de Gestión
// ================================

const express = require('express')
const router  = express.Router()
const { listar, obtener, crear, actualizar, darBaja, reactivar, eliminar, contar } = require('../controllers/maestros.controller')

router.get('/',              listar)
router.get('/count',         contar)
router.get('/:id',           obtener)
router.post('/',             crear)
router.put('/:id',           actualizar)
router.patch('/:id/baja',    darBaja)
router.patch('/:id/reactivar', reactivar)
router.delete('/:id',        eliminar)

module.exports = router