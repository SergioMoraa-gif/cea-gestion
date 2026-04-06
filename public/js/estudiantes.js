// ================================
// estudiantes.js — CEA Sistema de Gestión
// Refactorizado: esquema nuevo
// - Ya no se envía maestro_id al crear estudiante
// - clase_id sigue funcionando (el controller la inscribe en EstudiantesClases)
// - Los datos de clase/maestro vienen aplanados desde el controller
// ================================

const token = sessionStorage.getItem('cea_token')
if (!token) window.location.href = 'index.html'

const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

const MODALIDADES = { LM: 'Lun / Mié', MJ: 'Mar / Jue', viernes: 'Viernes', sabado: 'Sábado' }

let clasesData           = []
let maestrosData         = []
let estudiantesData      = []
let estudianteBajaId     = null
let estudianteEliminarId = null
let estudianteEditandoId = null

// --- Sidebar ---
const sidebar         = document.getElementById('sidebar')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')
document.getElementById('btnMenu').addEventListener('click', () => { sidebar.classList.add('open'); sidebarBackdrop.classList.add('show') })
document.getElementById('sidebarClose').addEventListener('click', cerrarSidebar)
sidebarBackdrop.addEventListener('click', cerrarSidebar)
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarSidebar() })
function cerrarSidebar() { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') }
document.getElementById('btnLogout').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html' })

// --- Formulario nuevo ---
const formCard  = document.getElementById('formCard')
const formError = document.getElementById('formError')

document.getElementById('btnNuevo').addEventListener('click', () => {
  document.getElementById('inputNombre').value = ''
  document.getElementById('inputFolio').value  = ''
  document.getElementById('inputClase').value  = ''
  document.getElementById('infoClase').style.display = 'none'
  ocultarError()
  formCard.style.display = 'block'
  document.getElementById('inputNombre').focus()
})

document.getElementById('btnCerrarForm').addEventListener('click', cerrarForm)
document.getElementById('btnCancelar').addEventListener('click', cerrarForm)
function cerrarForm() { formCard.style.display = 'none'; ocultarError() }

// --- Info clase al seleccionar ---
document.getElementById('inputClase').addEventListener('change', function () {
  const id    = parseInt(this.value)
  const clase = clasesData.find(c => c.id_clase === id)
  const info  = document.getElementById('infoClase')

  if (!clase) { info.style.display = 'none'; return }

  // id_maestro en el nuevo esquema
  const maestro = maestrosData.find(m => m.id_maestro === clase.id_maestro)
  document.getElementById('infoMaestroNombre').textContent = maestro ? maestro.nombre : 'Sin maestro'
  document.getElementById('infoModalidad').textContent     = MODALIDADES[clase.modalidad] || clase.modalidad
  document.getElementById('infoCosto').textContent         = `$${Number(clase.costo_mensual).toLocaleString('es-MX')}/mes`
  info.style.display = 'block'
})

// --- Guardar nuevo estudiante ---
document.getElementById('btnGuardar').addEventListener('click', async () => {
  const nombre   = document.getElementById('inputNombre').value.trim()
  const folio    = document.getElementById('inputFolio').value.trim()
  const clase_id = document.getElementById('inputClase').value

  if (!nombre)   return mostrarError('El nombre del niño es requerido.')
  if (!clase_id) return mostrarError('Selecciona una clase.')

  // Obtener id_maestro de la clase para redirección al calendario
  const clase      = clasesData.find(c => c.id_clase === parseInt(clase_id))
  const id_maestro = clase ? clase.id_maestro : null

  setLoading(true)
  ocultarError()

  try {
    // Ya NO se envía maestro_id — el controller maneja la inscripción en EstudiantesClases
    const res  = await fetch('/api/estudiantes', {
      method: 'POST', headers,
      body: JSON.stringify({ nombre, folio, clase_id: parseInt(clase_id) })
    })
    const data = await res.json()
    if (!res.ok) return mostrarError(data.message || 'Error al guardar.')

    cerrarForm()

    // Redirigir al calendario del maestro para asignar horario
    if (id_maestro) {
      window.location.href = `perfil-maestro.html?id=${id_maestro}&nuevo=${data.estudiante.id_estudiante}`
    } else {
      cargarEstudiantes()
    }
  } catch (err) {
    mostrarError('Error de conexión.')
  } finally {
    setLoading(false)
  }
})

// --- Cargar datos iniciales ---
async function cargarDatos() {
  try {
    const [resClases, resMaestros] = await Promise.all([
      fetch('/api/clases',   { headers }),
      fetch('/api/maestros', { headers })
    ])
    const dc = await resClases.json()
    const dm = await resMaestros.json()

    clasesData   = (dc.clases   || []).filter(c => c.activa !== false)
    maestrosData = dm.maestros  || []

    // Llenar selector de clases en formulario nuevo
    const selClase = document.getElementById('inputClase')
    selClase.innerHTML = '<option value="">— Selecciona una clase —</option>'
    clasesData.forEach(c => {
      const maestro = maestrosData.find(m => m.id_maestro === c.id_maestro)
      const opt = document.createElement('option')
      opt.value       = c.id_clase   // ← id_clase
      opt.textContent = `${c.nombre} — ${maestro ? maestro.nombre : 'Sin maestro'} (${MODALIDADES[c.modalidad] || c.modalidad})`
      selClase.appendChild(opt)
    })

    // Llenar selector de clases en modal editar
    const selEdit = document.getElementById('editClase')
    selEdit.innerHTML = '<option value="">— Selecciona una clase —</option>'
    clasesData.forEach(c => {
      const maestro = maestrosData.find(m => m.id_maestro === c.id_maestro)
      const opt = document.createElement('option')
      opt.value       = c.id_clase
      opt.textContent = `${c.nombre} — ${maestro ? maestro.nombre : 'Sin maestro'}`
      selEdit.appendChild(opt)
    })

    // Llenar filtro de maestros
    const filtroMaestro = document.getElementById('filtroMaestro')
    filtroMaestro.innerHTML = '<option value="">Todos los maestros</option>'
    maestrosData.filter(m => m.activo !== false).forEach(m => {
      const opt = document.createElement('option')
      opt.value = m.id_maestro; opt.textContent = m.nombre
      filtroMaestro.appendChild(opt)
    })

  } catch (err) {
    console.error('Error cargando datos:', err)
  }
}

// --- Cargar lista de estudiantes ---
async function cargarEstudiantes() {
  const body         = document.getElementById('tablaBody')
  const loadingMsg   = document.getElementById('loadingMsg')
  const emptyMsg     = document.getElementById('emptyMsg')
  const tablaWrapper = document.getElementById('tablaWrapper')

  body.innerHTML = ''
  loadingMsg.style.display   = 'block'
  emptyMsg.style.display     = 'none'
  tablaWrapper.style.display = 'none'

  const busqueda    = document.getElementById('buscador').value.toLowerCase()
  const estado      = document.getElementById('filtroEstado').value
  const maestroFilt = document.getElementById('filtroMaestro').value

  try {
    const res  = await fetch('/api/estudiantes', { headers })
    const data = await res.json()
    estudiantesData = data.estudiantes || []
    let lista       = estudiantesData

    // Filtros — el controller ya devuelve id_maestro y clase_id aplanados
    if (busqueda)    lista = lista.filter(e => e.nombre.toLowerCase().includes(busqueda) || (e.folio || '').toLowerCase().includes(busqueda))
    if (estado === 'activos')   lista = lista.filter(e => e.activo !== false)
    if (estado === 'inactivos') lista = lista.filter(e => e.activo === false)
    if (maestroFilt) lista = lista.filter(e => String(e.id_maestro) === maestroFilt)

    loadingMsg.style.display = 'none'
    if (lista.length === 0) { emptyMsg.style.display = 'block'; return }
    tablaWrapper.style.display = 'block'

    lista.forEach(e => {
      const clase   = clasesData.find(c => c.id_clase === e.id_clase)
      const maestro = maestrosData.find(m => m.id_maestro === e.id_maestro)

      const tr = document.createElement('tr')
      if (e.activo === false) tr.classList.add('inactivo')

      tr.innerHTML = `
        <td><strong>${e.folio || '—'}</strong></td>
        <td>${e.nombre}</td>
        <td>${clase ? clase.nombre : (e.clase_nombre || '—')}</td>
        <td>${maestro ? maestro.nombre : '—'}</td>
        <td>${clase ? (MODALIDADES[clase.modalidad] || clase.modalidad) : (e.clase_modalidad || '—')}</td>
        <td>${e.activo !== false
          ? '<span class="badge-activo">Activo</span>'
          : '<span class="badge-inactivo">Inactivo</span>'}</td>
        <td>
          <div class="acciones">
            ${e.activo !== false ? `
              <button class="btn-accion btn-accion-editar"     onclick="abrirEditar(${e.id_estudiante})">Editar</button>
              <button class="btn-accion btn-accion-calendario" onclick="irCalendario(${e.id_maestro}, ${e.id_estudiante})">Horario</button>
              <button class="btn-accion btn-accion-baja"       onclick="confirmarBaja(${e.id_estudiante})">Dar de baja</button>
            ` : `
              <button class="btn-accion btn-accion-reactivar"  onclick="reactivarEstudiante(${e.id_estudiante})">Reactivar</button>
              <button class="btn-accion btn-accion-eliminar"   onclick="confirmarEliminar(${e.id_estudiante})">Eliminar</button>
            `}
          </div>
        </td>
      `
      body.appendChild(tr)
    })

  } catch (err) {
    loadingMsg.textContent = 'Error al cargar estudiantes.'
  }
}

// --- Ir al calendario ---
function irCalendario(id_maestro, id_estudiante) {
  if (!id_maestro) return alert('Este estudiante no tiene maestro asignado.')
  window.location.href = `perfil-maestro.html?id=${id_maestro}&estudiante=${id_estudiante}`
}

// --- Editar ---
async function abrirEditar(id) {
  try {
    const res  = await fetch(`/api/estudiantes/${id}`, { headers })
    const data = await res.json()
    const e    = data.estudiante

    estudianteEditandoId = id
    document.getElementById('editNombre').value = e.nombre
    document.getElementById('editFolio').value  = e.folio || ''
    document.getElementById('editClase').value  = e.id_clase || ''
    document.getElementById('editError').style.display  = 'none'
    document.getElementById('modalEditar').style.display = 'flex'
  } catch (err) { alert('Error al cargar datos.') }
}

document.getElementById('modalEditarCerrar').addEventListener('click',   () => { document.getElementById('modalEditar').style.display = 'none' })
document.getElementById('modalEditarCancelar').addEventListener('click', () => { document.getElementById('modalEditar').style.display = 'none' })

document.getElementById('modalEditarGuardar').addEventListener('click', async () => {
  const nombre   = document.getElementById('editNombre').value.trim()
  const folio    = document.getElementById('editFolio').value.trim()
  const clase_id = document.getElementById('editClase').value
  const errEl    = document.getElementById('editError')

  if (!nombre) { errEl.textContent = 'El nombre es requerido.'; errEl.style.display = 'block'; return }

  const clase      = clasesData.find(c => c.id_clase === parseInt(clase_id))
  const id_maestro = clase ? clase.id_maestro : null

  // Verificar si cambió la clase para borrar horarios anteriores
  const estAnterior  = estudiantesData.find(e => e.id_estudiante === estudianteEditandoId)
  const cambioClase  = estAnterior && String(estAnterior.id_clase) !== String(clase_id)

  const btnG = document.getElementById('modalEditarGuardar')
  btnG.disabled = true
  btnG.querySelector('.btn-text').style.display   = 'none'
  btnG.querySelector('.btn-loader').style.display = 'flex'

  try {
    // Si cambió la clase, borrar horarios anteriores
    if (cambioClase) {
      await fetch(`/api/horarios/estudiante/${estudianteEditandoId}`, { method: 'DELETE', headers })
    }

    const res = await fetch(`/api/estudiantes/${estudianteEditandoId}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ nombre, folio, clase_id: parseInt(clase_id) })
    })
    const data = await res.json()
    if (!res.ok) { errEl.textContent = data.message || 'Error.'; errEl.style.display = 'block'; return }

    document.getElementById('modalEditar').style.display = 'none'

    // Si cambió la clase, redirigir al calendario para reasignar horario
    if (cambioClase && id_maestro) {
      window.location.href = `perfil-maestro.html?id=${id_maestro}&nuevo=${estudianteEditandoId}`
    } else {
      cargarEstudiantes()
    }
  } catch (err) {
    errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'
  } finally {
    btnG.disabled = false
    btnG.querySelector('.btn-text').style.display   = 'inline'
    btnG.querySelector('.btn-loader').style.display = 'none'
  }
})

// --- Dar de baja ---
function confirmarBaja(id) {
  estudianteBajaId = id
  document.getElementById('modalBaja').style.display = 'flex'
}
document.getElementById('modalBajaCancelar').addEventListener('click', () => { document.getElementById('modalBaja').style.display = 'none'; estudianteBajaId = null })
document.getElementById('modalBajaConfirmar').addEventListener('click', async () => {
  if (!estudianteBajaId) return
  try {
    const res = await fetch(`/api/estudiantes/${estudianteBajaId}/baja`, { method: 'PATCH', headers })
    if (res.ok) { document.getElementById('modalBaja').style.display = 'none'; cargarEstudiantes() }
  } catch (err) { alert('Error.') }
  estudianteBajaId = null
})

// --- Reactivar ---
async function reactivarEstudiante(id) {
  try {
    const res = await fetch(`/api/estudiantes/${id}/reactivar`, { method: 'PATCH', headers })
    if (res.ok) cargarEstudiantes()
    else alert('Error al reactivar.')
  } catch (err) { alert('Error de conexión.') }
}

// --- Eliminar ---
function confirmarEliminar(id) {
  estudianteEliminarId = id
  document.getElementById('modalEliminar').style.display = 'flex'
}
document.getElementById('modalEliminarCancelar').addEventListener('click', () => { document.getElementById('modalEliminar').style.display = 'none'; estudianteEliminarId = null })
document.getElementById('modalEliminarConfirmar').addEventListener('click', async () => {
  if (!estudianteEliminarId) return
  try {
    const res = await fetch(`/api/estudiantes/${estudianteEliminarId}`, { method: 'DELETE', headers })
    if (res.ok) { document.getElementById('modalEliminar').style.display = 'none'; cargarEstudiantes() }
    else alert('No se puede eliminar, tiene datos relacionados.')
  } catch (err) { alert('Error de conexión.') }
  estudianteEliminarId = null
})

// --- Filtros ---
document.getElementById('buscador').addEventListener('input',       cargarEstudiantes)
document.getElementById('filtroEstado').addEventListener('change',  cargarEstudiantes)
document.getElementById('filtroMaestro').addEventListener('change', cargarEstudiantes)

// --- Helpers ---
function mostrarError(msg) { formError.textContent = msg; formError.style.display = 'block' }
function ocultarError()    { formError.style.display = 'none' }
function setLoading(estado) {
  const btn = document.getElementById('btnGuardar')
  btn.disabled = estado
  btn.querySelector('.btn-text').style.display   = estado ? 'none'  : 'inline'
  btn.querySelector('.btn-loader').style.display = estado ? 'flex'  : 'none'
}

window.abrirEditar         = abrirEditar
window.irCalendario        = irCalendario
window.confirmarBaja       = confirmarBaja
window.reactivarEstudiante = reactivarEstudiante
window.confirmarEliminar   = confirmarEliminar

// --- Iniciar ---
cargarDatos().then(() => cargarEstudiantes())
