// ================================
// auth.js — Lógica del Login
// CEA Sistema de Gestión
// ================================

const emailInput    = document.getElementById('emailInput')
const passwordInput = document.getElementById('passwordInput')
const btnLogin      = document.getElementById('btnLogin')
const errorMsg      = document.getElementById('errorMsg')
const hintMsg       = document.getElementById('hintMsg')
const togglePassword= document.getElementById('togglePassword')
const eyeIcon       = document.getElementById('eyeIcon')

let intentosFallidos = 0

// --- Mostrar / ocultar contraseña ---
togglePassword.addEventListener('click', () => {
  const esPassword = passwordInput.type === 'password'
  passwordInput.type = esPassword ? 'text' : 'password'

  // Cambiar ícono
  eyeIcon.innerHTML = esPassword
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
       <line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
       <circle cx="12" cy="12" r="3"/>`
})

// --- Permitir login con Enter ---
passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') iniciarSesion()
})

emailInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') iniciarSesion()
})

// --- Botón login ---
btnLogin.addEventListener('click', iniciarSesion)

// --- Función principal de login ---
async function iniciarSesion() {
  const email    = emailInput.value.trim()
  const password = passwordInput.value.trim()

  // Validaciones básicas
  if (!email || !password) {
    mostrarError('Por favor ingresa tu usuario y contraseña.')
    return
  }

  if (!esEmailValido(email)) {
    mostrarError('Ingresa un correo electrónico válido.')
    return
  }

  // Mostrar estado de carga
  setLoading(true)
  ocultarError()

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    const data = await res.json()

    if (!res.ok) {
      intentosFallidos++
      mostrarError('Contraseña incorrecta. Intenta de nuevo.')
      if (intentosFallidos >= 2) hintMsg.style.display = 'flex'
      if (intentosFallidos >= 3) bloquearTemporalmente(5)
      return
    }

    // Guardar token en sessionStorage
    sessionStorage.setItem('cea_token', data.token)
    sessionStorage.setItem('cea_user',  JSON.stringify(data.user))

    // Redirigir al dashboard
    window.location.href = 'dashboard.html'

  } catch (err) {
    console.error('Error de conexión:', err)
    mostrarError('No se pudo conectar al servidor. Verifica tu conexión.')
  } finally {
    setLoading(false)
  }
}

// --- Helpers ---
function mostrarError(mensaje) {
  errorMsg.textContent = mensaje
  errorMsg.style.display = 'block'
}

function ocultarError() {
  errorMsg.style.display = 'none'
  errorMsg.textContent = ''
}

function bloquearTemporalmente(segundos) {
  let restantes = segundos
  btnLogin.disabled = true
  const textoOriginal = document.querySelector('.btn-text')
  textoOriginal.textContent = `Espera ${restantes}s...`

  const intervalo = setInterval(() => {
    restantes--
    if (restantes <= 0) {
      clearInterval(intervalo)
      btnLogin.disabled = false
      textoOriginal.textContent = 'Ingresar'
    } else {
      textoOriginal.textContent = `Espera ${restantes}s...`
    }
  }, 1000)
}

function setLoading(estado) {
  btnLogin.disabled = estado
  document.querySelector('.btn-text').style.display  = estado ? 'none'  : 'inline'
  document.querySelector('.btn-loader').style.display = estado ? 'flex' : 'none'
}

function esEmailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
