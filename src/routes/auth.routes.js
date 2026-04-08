// ================================
// auth.routes.js — CEA Sistema de Gestión
// ================================

const express = require('express')
const router  = express.Router()
const { login, logout, listarUsuarios, crearUsuario, cambiarPassword, eliminarUsuario } = require('../controllers/auth.controller')

router.post('/login',                  login)
router.post('/logout',                 logout)
router.get('/usuarios',                listarUsuarios)
router.post('/usuarios',               crearUsuario)
router.patch('/usuarios/:id/password', cambiarPassword)
router.delete('/usuarios/:id',         eliminarUsuario)

module.exports = router
