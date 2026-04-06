// ================================
// auth.routes.js — Rutas de autenticación
// CEA Sistema de Gestión
// ================================

const express = require('express')
const router  = express.Router()
const { login, logout } = require('../controllers/auth.controller')

// POST /api/auth/login
router.post('/login', login)

// POST /api/auth/logout
router.post('/logout', logout)

module.exports = router