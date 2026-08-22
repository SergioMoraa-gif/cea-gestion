// ================================
// auth.routes.js — CEA Sistema de Gestión
// ================================

const express = require('express')
const router  = express.Router()
const { login, logout, listarUsuarios, crearUsuario, cambiarPassword, eliminarUsuario } = require('../controllers/auth.controller')
const { requireAuth } = require('../middlewares/auth.middleware')

// Login/logout deben quedar públicos: son el único punto de entrada antes
// de tener un token. Todo lo demás (gestión de usuarios) exige sesión.
router.post('/login',                  login)
router.post('/logout',                 logout)
router.get('/usuarios',                requireAuth, listarUsuarios)
router.post('/usuarios',               requireAuth, crearUsuario)
router.patch('/usuarios/:id/password', requireAuth, cambiarPassword)
router.delete('/usuarios/:id',         requireAuth, eliminarUsuario)

module.exports = router
