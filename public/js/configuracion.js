// ================================
// configuracion.js — CEA Sistema de Gestión
// ================================

const token = sessionStorage.getItem('cea_token')
const user  = JSON.parse(sessionStorage.getItem('cea_user') || 'null')
if (!token || !user) window.location.href = 'index.html'

const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

let usuariosData      = []
let usuarioEditandoId = null   // para cambiar pass
let usuarioElimId     = null   // para eliminar

// ─── Sidebar ───────────────────────────────────────────────
const sidebar         = document.getElementById('sidebar')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')
document.getElementById('btnMenu').addEventListener('click', () => { sidebar.classList.add('open'); sidebarBackdrop.classList.add('show') })
document.getElementById('sidebarClose').addEventListener('click', cerrarSidebar)
sidebarBackdrop.addEventListener('click', cerrarSidebar)
function cerrarSidebar() { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') }
document.getElementById('btnLogout').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html' })

// ─── Sesión actual ─────────────────────────────────────────
if (user) {
  const inicial = (user.email || '?')[0].toUpperCase()
  document.getElementById('sesionAvatar').textContent = inicial
  document.getElementById('sesionEmail').textContent  = user.email
}

// Cambiar mi propia contraseña
document.getElementById('btnCambiarMiPass').addEventListener('click', async () => {
  const nueva     = document.getElementById('miNuevaPassword').value
  const confirmar = document.getElementById('miConfirmarPassword').value
  const msgEl     = document.getElementById('msgMiPass')

  if (!nueva || nueva.length < 6) return mostrarMsg(msgEl, 'Mínimo 6 caracteres.', 'error')
  if (nueva !== confirmar)        return mostrarMsg(msgEl, 'Las contraseñas no coinciden.', 'error')

  try {
    const res  = await fetch(`/api/auth/usuarios/${user.id}/password`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ password: nueva })
    })
    const data = await res.json()
    if (!res.ok) return mostrarMsg(msgEl, data.message, 'error')
    document.getElementById('miNuevaPassword').value    = ''
    document.getElementById('miConfirmarPassword').value = ''
    mostrarMsg(msgEl, 'Contraseña actualizada correctamente.', 'ok')
  } catch { mostrarMsg(msgEl, 'Error de conexión.', 'error') }
})

// ─── Lista de usuarios ─────────────────────────────────────
async function cargarUsuarios() {
  try {
    const res  = await fetch('/api/auth/usuarios', { headers })
    const data = await res.json()
    usuariosData = data.usuarios || []
    renderUsuarios()
  } catch {
    document.getElementById('loadingUsuarios').textContent = 'Error al cargar usuarios.'
  }
}

function renderUsuarios() {
  const loadingEl = document.getElementById('loadingUsuarios')
  const listaEl   = document.getElementById('listaUsuarios')

  loadingEl.style.display = 'none'
  listaEl.style.display   = 'flex'
  listaEl.innerHTML = ''

  if (usuariosData.length === 0) {
    listaEl.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.35);font-size:.85rem;padding:1rem">No hay usuarios registrados.</p>'
    return
  }

  usuariosData.forEach(u => {
    const esYo    = u.id === user.id
    const inicial = (u.email || '?')[0].toUpperCase()
    const fecha   = u.created_at
      ? new Date(u.created_at).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' })
      : '—'

    const div = document.createElement('div')
    div.className = 'usuario-item'
    div.innerHTML = `
      <div class="usuario-avatar">${inicial}</div>
      <div class="usuario-info">
        <div class="usuario-email">
          ${u.email}
          ${esYo ? '<span class="usuario-yo">Tú</span>' : ''}
        </div>
        <div class="usuario-fecha">Registrado: ${fecha}</div>
      </div>
      <div class="usuario-acciones">
        <button class="btn-usr-pass" data-id="${u.id}" data-email="${u.email}">Cambiar contraseña</button>
        ${!esYo ? `<button class="btn-usr-eliminar" data-id="${u.id}" data-email="${u.email}">Eliminar</button>` : ''}
      </div>`
    listaEl.appendChild(div)
  })

  // Eventos delegados
  listaEl.querySelectorAll('.btn-usr-pass').forEach(btn =>
    btn.addEventListener('click', () => abrirCambiarPass(btn.dataset.id, btn.dataset.email))
  )
  listaEl.querySelectorAll('.btn-usr-eliminar').forEach(btn =>
    btn.addEventListener('click', () => abrirEliminar(btn.dataset.id, btn.dataset.email))
  )
}

// ─── Modal: nuevo usuario ──────────────────────────────────
document.getElementById('btnNuevoUsuario').addEventListener('click', () => {
  document.getElementById('nuevoEmail').value           = ''
  document.getElementById('nuevoPassword').value        = ''
  document.getElementById('nuevoPasswordConfirm').value = ''
  document.getElementById('errorNuevoUsuario').style.display = 'none'
  document.getElementById('modalNuevoUsuario').style.display = 'flex'
})

;['modalNuevoUsuarioCerrar', 'modalNuevoUsuarioCancelar'].forEach(id =>
  document.getElementById(id).addEventListener('click', () => {
    document.getElementById('modalNuevoUsuario').style.display = 'none'
  })
)

document.getElementById('btnCrearUsuario').addEventListener('click', async () => {
  const email    = document.getElementById('nuevoEmail').value.trim()
  const pass     = document.getElementById('nuevoPassword').value
  const confirm  = document.getElementById('nuevoPasswordConfirm').value
  const errEl    = document.getElementById('errorNuevoUsuario')

  if (!email)             return mostrarMsg(errEl, 'El correo es requerido.', 'error')
  if (!pass || pass.length < 6) return mostrarMsg(errEl, 'La contraseña debe tener al menos 6 caracteres.', 'error')
  if (pass !== confirm)   return mostrarMsg(errEl, 'Las contraseñas no coinciden.', 'error')

  const btn = document.getElementById('btnCrearUsuario')
  setBtnLoading(btn, true)
  errEl.style.display = 'none'

  try {
    const res  = await fetch('/api/auth/usuarios', {
      method: 'POST', headers,
      body: JSON.stringify({ email, password: pass })
    })
    const data = await res.json()
    if (!res.ok) return mostrarMsg(errEl, data.message, 'error')

    document.getElementById('modalNuevoUsuario').style.display = 'none'
    await cargarUsuarios()
  } catch { mostrarMsg(errEl, 'Error de conexión.', 'error') }
  finally { setBtnLoading(btn, false) }
})

// ─── Modal: cambiar contraseña de otro usuario ─────────────
function abrirCambiarPass(id, email) {
  usuarioEditandoId = id
  document.getElementById('cambiarPassInput').value        = ''
  document.getElementById('errorCambiarPass').style.display = 'none'
  document.getElementById('modalCambiarPassEmail').textContent = `Usuario: ${email}`
  document.getElementById('modalCambiarPass').style.display    = 'flex'
}

;['modalCambiarPassCerrar', 'modalCambiarPassCancelar'].forEach(id =>
  document.getElementById(id).addEventListener('click', () => {
    document.getElementById('modalCambiarPass').style.display = 'none'
  })
)

document.getElementById('btnConfirmarCambiarPass').addEventListener('click', async () => {
  const pass  = document.getElementById('cambiarPassInput').value
  const errEl = document.getElementById('errorCambiarPass')

  if (!pass || pass.length < 6) return mostrarMsg(errEl, 'Mínimo 6 caracteres.', 'error')

  const btn = document.getElementById('btnConfirmarCambiarPass')
  setBtnLoading(btn, true)
  errEl.style.display = 'none'

  try {
    const res  = await fetch(`/api/auth/usuarios/${usuarioEditandoId}/password`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ password: pass })
    })
    const data = await res.json()
    if (!res.ok) return mostrarMsg(errEl, data.message, 'error')
    document.getElementById('modalCambiarPass').style.display = 'none'
  } catch { mostrarMsg(errEl, 'Error de conexión.', 'error') }
  finally { setBtnLoading(btn, false) }
})

// ─── Modal: eliminar usuario ───────────────────────────────
function abrirEliminar(id, email) {
  usuarioElimId = id
  document.getElementById('modalEliminarUsuarioEmail').textContent =
    `Se eliminará la cuenta: ${email}`
  document.getElementById('modalEliminarUsuario').style.display = 'flex'
}

document.getElementById('modalEliminarUsuarioCancelar').addEventListener('click', () => {
  document.getElementById('modalEliminarUsuario').style.display = 'none'
})

document.getElementById('btnConfirmarEliminarUsuario').addEventListener('click', async () => {
  if (!usuarioElimId) return
  const btn = document.getElementById('btnConfirmarEliminarUsuario')
  setBtnLoading(btn, true)

  try {
    const res = await fetch(`/api/auth/usuarios/${usuarioElimId}`, {
      method: 'DELETE', headers
    })
    const data = await res.json()
    if (!res.ok) { alert(data.message || 'Error al eliminar.'); return }
    document.getElementById('modalEliminarUsuario').style.display = 'none'
    await cargarUsuarios()
  } catch { alert('Error de conexión.') }
  finally { setBtnLoading(btn, false) }
})

// ─── Utilidades ────────────────────────────────────────────
function mostrarMsg(el, texto, tipo) {
  el.textContent  = texto
  el.className    = `cfg-msg cfg-msg-${tipo}`
  el.style.display = 'block'
}

function setBtnLoading(btn, loading) {
  btn.disabled = loading
  const text   = btn.querySelector('.btn-text')
  const loader = btn.querySelector('.btn-loader')
  if (text)   text.style.display   = loading ? 'none' : 'inline'
  if (loader) loader.style.display = loading ? 'flex'  : 'none'
}

cargarUsuarios()
