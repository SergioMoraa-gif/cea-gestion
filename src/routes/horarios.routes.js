const express = require('express')
const router  = express.Router()
const { porMaestro, porEstudiante, crear, actualizar, eliminar, eliminarPorEstudiante } = require('../controllers/horarios.controller')

router.get('/maestro/:id',       porMaestro)
router.get('/estudiante/:id',    porEstudiante)
router.post('/',                 crear)
router.patch('/:id',             actualizar)
router.delete('/estudiante/:id', eliminarPorEstudiante)
router.delete('/:id',            eliminar)

module.exports = router