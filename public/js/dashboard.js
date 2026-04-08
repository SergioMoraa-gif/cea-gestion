// ================================
// dashboard.js — Lógica del Dashboard
// CEA Sistema de Gestión
// ================================

// --- Verificar sesión ---
const token = sessionStorage.getItem('cea_token')
const user  = JSON.parse(sessionStorage.getItem('cea_user') || 'null')

if (!token || !user) {
  window.location.href = 'index.html'
}

// --- Mostrar usuario en topbar ---
const topbarUser = document.getElementById('topbarUser')
if (topbarUser && user) {
  topbarUser.textContent = user.email
}

// --- Mostrar fecha de hoy ---
const fechaHoy = document.getElementById('fechaHoy')
if (fechaHoy) {
  const hoy = new Date()
  fechaHoy.textContent = hoy.toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
}

// --- Sidebar ---
const sidebar         = document.getElementById('sidebar')
const btnMenu         = document.getElementById('btnMenu')
const sidebarClose    = document.getElementById('sidebarClose')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')

function abrirSidebar() {
  sidebar.classList.add('open')
  sidebarBackdrop.classList.add('show')
  document.body.style.overflow = 'hidden'
}

function cerrarSidebar() {
  sidebar.classList.remove('open')
  sidebarBackdrop.classList.remove('show')
  document.body.style.overflow = ''
}

btnMenu.addEventListener('click', abrirSidebar)
sidebarClose.addEventListener('click', cerrarSidebar)
sidebarBackdrop.addEventListener('click', cerrarSidebar)

// Cerrar con Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrarSidebar()
})

// --- Cerrar sesión ---
document.getElementById('btnLogout').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST' })
  } catch (e) {}
  sessionStorage.removeItem('cea_token')
  sessionStorage.removeItem('cea_user')
  window.location.href = 'index.html'
})

// --- Cargar estadísticas desde la API ---
async function cargarEstadisticas() {
  try {
    const headers = { 'Authorization': `Bearer ${token}` }

    const [resEst, resPagos] = await Promise.all([
      fetch('/api/estudiantes/count', { headers }),
      fetch('/api/pagos/pendientes',  { headers })
    ])

    if (resEst.ok) {
      const data = await resEst.json()
      document.getElementById('totalEstudiantes').textContent = data.total ?? '0'
    }

    if (resPagos.ok) {
      const data = await resPagos.json()
      document.getElementById('totalPagos').textContent = data.total ?? '0'
    }

  } catch (err) {
    console.error('Error cargando estadísticas:', err)
    document.getElementById('totalEstudiantes').textContent = '0'
    document.getElementById('totalPagos').textContent       = '0'
  }
}

cargarEstadisticas()