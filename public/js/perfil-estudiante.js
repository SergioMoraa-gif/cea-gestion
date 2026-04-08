// ================================
// perfil-estudiante.js — CEA Sistema de Gestión
// ================================

const token = sessionStorage.getItem('cea_token')
if (!token) window.location.href = 'index.html'

const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

const params      = new URLSearchParams(window.location.search)
const estudianteId = parseInt(params.get('id'))
if (!estudianteId) window.location.href = 'estudiantes.html'

const DIAS       = ['lunes','martes','miercoles','jueves','viernes','sabado']
const DIAS_LABEL = ['Lunes','Martes','Miérc.','Jueves','Viernes','Sábado']
const COLORES    = ['color-0','color-1','color-2','color-3','color-4','color-5']

const BLOQUES = []
for (let h = 9; h <= 19; h++) {
  BLOQUES.push(`${String(h).padStart(2,'0')}:00`)
  BLOQUES.push(`${String(h).padStart(2,'0')}:30`)
}
BLOQUES.push('20:00')

let estudianteData = null
let horariosData   = []
let maestrosData   = []
let pagosData      = []

// Bloque actualmente seleccionado en el modal
let bloqueActual   = null

// Estado del modal de edición de bloque
let tipoSeleccionado     = 'individual'
let duracionSeleccionada = 30

// ─── Sidebar ───────────────────────────────────────────────
const sidebar         = document.getElementById('sidebar')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')
document.getElementById('btnMenu').addEventListener('click', () => {
  sidebar.classList.add('open'); sidebarBackdrop.classList.add('show')
})
document.getElementById('sidebarClose').addEventListener('click', cerrarSidebar)
sidebarBackdrop.addEventListener('click', cerrarSidebar)
function cerrarSidebar() { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') }
document.getElementById('btnLogout').addEventListener('click', () => {
  sessionStorage.clear(); window.location.href = 'index.html'
})
document.getElementById('btnVolver').addEventListener('click', () => {
  window.location.href = 'estudiantes.html'
})

// ─── Inicializar ────────────────────────────────────────────
async function iniciar() {
  try {
    const [resEst, resMae, resHor, resPag] = await Promise.all([
      fetch(`/api/estudiantes/${estudianteId}`, { headers }),
      fetch('/api/maestros', { headers }),
      fetch(`/api/horarios/estudiante/${estudianteId}`, { headers }),
      fetch(`/api/pagos?id_estudiante=${estudianteId}`, { headers })
    ])

    const dataEst = await resEst.json()
    const dataMae = await resMae.json()
    const dataHor = await resHor.json()
    const dataPag = await resPag.json()

    estudianteData = dataEst.estudiante || null
    maestrosData   = (dataMae.maestros  || []).filter(m => m.activo !== false)
    horariosData   = dataHor.horarios   || []
    pagosData      = dataPag.pagos      || []

    if (!estudianteData) { window.location.href = 'estudiantes.html'; return }

    renderInfo()
    renderCalendario()
    renderPagos()
  } catch (err) {
    document.getElementById('loadingCal').textContent = 'Error al cargar los datos.'
  }
}

// ─── Info del alumno ────────────────────────────────────────
function renderInfo() {
  const e = estudianteData
  document.getElementById('tituloEstudiante').textContent = e.nombre
  document.getElementById('subtituloEstudiante').textContent =
    e.folio ? `Folio: ${e.folio}` : 'Perfil del estudiante'

  document.getElementById('infoNombre').textContent   = e.nombre    || '—'
  document.getElementById('infoFolio').textContent    = e.folio     || '—'
  document.getElementById('infoTelefono').textContent = e.telefono  || '—'
  document.getElementById('infoPrecio').textContent   = `$${Number(e.precio_mensual || 0).toLocaleString('es-MX')}`
  const estadoEl = document.getElementById('infoEstado')
  estadoEl.innerHTML = e.activo
    ? '<span class="badge-activo">Activo</span>'
    : '<span class="badge-inactivo">Inactivo</span>'
}

document.getElementById('btnEditarInfo').addEventListener('click', () => {
  const e = estudianteData
  document.getElementById('editNombre').value   = e.nombre          || ''
  document.getElementById('editFolio').value    = e.folio           || ''
  document.getElementById('editTelefono').value = e.telefono        || ''
  document.getElementById('editPrecio').value   = e.precio_mensual  || 0
  document.getElementById('editError').style.display = 'none'
  document.getElementById('vistaLectura').style.display = 'none'
  document.getElementById('vistaEdicion').style.display = 'block'
  document.getElementById('btnEditarInfo').style.display = 'none'
})

document.getElementById('btnCancelarEdicion').addEventListener('click', () => {
  document.getElementById('vistaEdicion').style.display = 'none'
  document.getElementById('vistaLectura').style.display = 'block'
  document.getElementById('btnEditarInfo').style.display = 'inline-block'
})

document.getElementById('btnGuardarInfo').addEventListener('click', async () => {
  const nombre   = document.getElementById('editNombre').value.trim()
  const folio    = document.getElementById('editFolio').value.trim()
  const telefono = document.getElementById('editTelefono').value.trim()
  const precio   = parseFloat(document.getElementById('editPrecio').value) || 0
  const errEl    = document.getElementById('editError')

  if (!nombre) { errEl.textContent = 'El nombre es requerido.'; errEl.style.display = 'block'; return }
  errEl.style.display = 'none'

  const btn = document.getElementById('btnGuardarInfo')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  try {
    const res  = await fetch(`/api/estudiantes/${estudianteId}`, {
      method: 'PUT', headers,
      body: JSON.stringify({ nombre, folio, telefono, precio_mensual: precio })
    })
    const data = await res.json()
    if (!res.ok) { errEl.textContent = data.message || 'Error al guardar.'; errEl.style.display = 'block'; return }

    estudianteData = data.estudiante
    renderInfo()
    document.getElementById('vistaEdicion').style.display = 'none'
    document.getElementById('vistaLectura').style.display = 'block'
    document.getElementById('btnEditarInfo').style.display = 'inline-block'
  } catch (err) {
    errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// ─── Calendario del alumno ──────────────────────────────────
function renderCalendario() {
  const head = document.getElementById('calHead')
  const body = document.getElementById('calBody')

  // Qué días tiene clases este alumno
  const diasConClases = new Set(horariosData.map(h => h.dia))
  const diasMostrar   = DIAS.filter(d => diasConClases.has(d))
  // Si no tiene clases, mostrar todos los días
  const diasRender    = diasMostrar.length > 0 ? diasMostrar : DIAS

  // Color por maestro
  const colorMap = {}
  let ci = 0
  maestrosData.forEach(m => { colorMap[m.id_maestro] = COLORES[ci++ % COLORES.length] })

  head.innerHTML = `<tr>
    <th>Hora</th>
    ${diasRender.map(d => `<th class="dia-activo">${DIAS_LABEL[DIAS.indexOf(d)]}</th>`).join('')}
  </tr>`
  body.innerHTML = ''

  // Mapa de horarios
  const mapa = {}
  horariosData.forEach(h => {
    const key = `${h.dia}_${h.hora_inicio}`
    if (!mapa[key]) mapa[key] = []
    mapa[key].push(h)
  })

  // Celdas a omitir por rowspan (bloques de 60 min)
  const saltarCelda = new Set()
  horariosData.forEach(h => {
    if (h.duracion === 60 || h.tipo === 'grupal') {
      const [hh, mm] = h.hora_inicio.split(':').map(Number)
      for (const delta of [30, 60]) {
        const tot = hh * 60 + mm + delta
        const key = `${h.dia}_${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`
        saltarCelda.add(key)
      }
    }
  })

  BLOQUES.forEach(hora => {
    const tr  = document.createElement('tr')
    const tdH = document.createElement('td')
    tdH.className = 'td-hora'; tdH.textContent = hora
    tr.appendChild(tdH)

    diasRender.forEach(dia => {
      const keyFull = `${dia}_${hora}:00`
      if (saltarCelda.has(keyFull)) return

      const td    = document.createElement('td')
      td.className = 'td-bloque'
      const bloqs  = mapa[keyFull] || []

      if (bloqs.length > 0) {
        const esGrupal = bloqs.some(b => b.tipo === 'grupal' || b.duracion === 60)
        if (esGrupal) td.rowSpan = 3

        bloqs.forEach(b => {
          const maestro = maestrosData.find(m => m.id_maestro === (b.maestro_id || b.id_maestro))
          const div     = document.createElement('div')
          div.className = `bloque-clase ${colorMap[b.maestro_id || b.id_maestro] || 'color-0'}${esGrupal ? ' bloque-grande' : ''}`
          div.innerHTML = `
            <div class="bc-maestro">${maestro ? maestro.nombre : '—'}</div>
            <div class="bc-tipo">${b.tipo === 'grupal' ? 'Grupal' : 'Individual'} · ${b.duracion || 30} min</div>`
          div.addEventListener('click', () => abrirModalBloque(b, dia, hora, maestro))
          td.appendChild(div)
        })
      } else {
        const div = document.createElement('div')
        div.className = 'bloque-vacio'
        td.appendChild(div)
      }
      tr.appendChild(td)
    })
    body.appendChild(tr)
  })

  document.getElementById('loadingCal').style.display        = 'none'
  document.getElementById('calendarioScroll').style.display  = 'block'
}

// ─── Modal: ver / editar bloque ────────────────────────────
function abrirModalBloque(horario, dia, hora, maestro) {
  bloqueActual = horario

  const diaLabel = DIAS_LABEL[DIAS.indexOf(dia)]
  document.getElementById('modalBloqueTitle').textContent =
    `${diaLabel} · ${hora}`
  document.getElementById('modalBloqueInfo').innerHTML =
    `Maestro: <strong>${maestro ? maestro.nombre : '—'}</strong>`

  tipoSeleccionado     = horario.tipo     || 'individual'
  duracionSeleccionada = horario.duracion || 30
  actualizarBotonesTipo(tipoSeleccionado)
  actualizarBotonesDuracion(duracionSeleccionada)

  document.getElementById('modalBloque').style.display = 'flex'
}

function actualizarBotonesTipo(tipo) {
  tipoSeleccionado = tipo
  document.querySelectorAll('.btn-tipo').forEach(b =>
    b.classList.toggle('activo', b.dataset.val === tipo))
}

function actualizarBotonesDuracion(dur) {
  duracionSeleccionada = parseInt(dur)
  document.querySelectorAll('.btn-duracion').forEach(b =>
    b.classList.toggle('activo', parseInt(b.dataset.val) === parseInt(dur)))
}

document.querySelectorAll('.btn-tipo').forEach(b =>
  b.addEventListener('click', () => actualizarBotonesTipo(b.dataset.val))
)
document.querySelectorAll('.btn-duracion').forEach(b =>
  b.addEventListener('click', () => actualizarBotonesDuracion(b.dataset.val))
)

document.getElementById('modalBloqueCerrar').addEventListener('click', () => {
  document.getElementById('modalBloque').style.display = 'none'
})
document.getElementById('modalBloqueCancelar').addEventListener('click', () => {
  document.getElementById('modalBloque').style.display = 'none'
})

// Guardar cambios del bloque
document.getElementById('btnGuardarBloque').addEventListener('click', async () => {
  if (!bloqueActual) return
  const btn = document.getElementById('btnGuardarBloque')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  const durMin  = duracionSeleccionada
  const [hh, mm] = (bloqueActual.hora_inicio || '00:00:00').split(':').map(Number)
  const tot      = hh * 60 + mm + durMin
  const horaFin  = `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`

  try {
    const res = await fetch(`/api/horarios/${bloqueActual.id || bloqueActual.id_horario}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({
        tipo:      tipoSeleccionado,
        duracion:  duracionSeleccionada,
        hora_fin:  horaFin
      })
    })
    const data = await res.json()
    if (!res.ok) { alert(data.message || 'Error al guardar.'); return }

    document.getElementById('modalBloque').style.display = 'none'
    await recargarHorarios()
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// Eliminar bloque — abre confirmación
document.getElementById('btnEliminarBloque').addEventListener('click', () => {
  document.getElementById('modalBloque').style.display = 'none'
  document.getElementById('modalConfEliminar').style.display = 'flex'
})

document.getElementById('modalConfEliminarCancelar').addEventListener('click', () => {
  document.getElementById('modalConfEliminar').style.display = 'none'
  document.getElementById('modalBloque').style.display = 'flex'
})

document.getElementById('modalConfEliminarConfirmar').addEventListener('click', async () => {
  if (!bloqueActual) return
  const btn = document.getElementById('modalConfEliminarConfirmar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  try {
    const res = await fetch(`/api/horarios/${bloqueActual.id || bloqueActual.id_horario}`, {
      method: 'DELETE', headers
    })
    const data = await res.json()
    if (!res.ok) { alert(data.message || 'Error al eliminar.'); return }

    document.getElementById('modalConfEliminar').style.display = 'none'
    await recargarHorarios()
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

async function recargarHorarios() {
  try {
    document.getElementById('loadingCal').style.display       = 'block'
    document.getElementById('calendarioScroll').style.display = 'none'
    const res    = await fetch(`/api/horarios/estudiante/${estudianteId}`, { headers })
    const data   = await res.json()
    horariosData = data.horarios || []
    renderCalendario()
  } catch (err) {
    document.getElementById('loadingCal').textContent = 'Error al recargar.'
  }
}

// ─── Asignar clase — seleccionar maestro ───────────────────
document.getElementById('btnAsignarClase').addEventListener('click', () => {
  const lista = document.getElementById('maestrosLista')
  lista.innerHTML = ''

  if (maestrosData.length === 0) {
    lista.innerHTML = '<p style="color:rgba(255,255,255,0.5);font-size:0.85rem;text-align:center">No hay maestros activos.</p>'
  } else {
    let ci = 0
    const colorMap = {}
    maestrosData.forEach(m => { colorMap[m.id_maestro] = COLORES[ci++ % COLORES.length] })

    maestrosData.forEach(m => {
      const btn = document.createElement('button')
      btn.className = 'maestro-item-btn'
      btn.innerHTML = `
        <div class="maestro-dot ${colorMap[m.id_maestro]}"></div>
        <span>${m.nombre}</span>`
      btn.addEventListener('click', () => {
        document.getElementById('modalMaestro').style.display = 'none'
        window.location.href = `perfil-maestro.html?id=${m.id_maestro}&nuevo=${estudianteId}`
      })
      lista.appendChild(btn)
    })
  }

  document.getElementById('modalMaestro').style.display = 'flex'
})

document.getElementById('modalMaestroCerrar').addEventListener('click', () => {
  document.getElementById('modalMaestro').style.display = 'none'
})

// ─── Pagos ──────────────────────────────────────────────────
function renderPagos() {
  const loadingEl = document.getElementById('loadingPagos')
  const emptyEl   = document.getElementById('emptyPagos')
  const wrapEl    = document.getElementById('tablaPagosWrapper')
  const body      = document.getElementById('tablaPagosBody')

  loadingEl.style.display = 'none'
  body.innerHTML = ''

  if (pagosData.length === 0) {
    emptyEl.style.display = 'block'
    wrapEl.style.display  = 'none'
    return
  }

  emptyEl.style.display = 'none'
  wrapEl.style.display  = 'block'

  // Ordenar por mes descendente
  const ordenados = [...pagosData].sort((a, b) =>
    (b.mes || '').localeCompare(a.mes || ''))

  ordenados.forEach(p => {
    const tr = document.createElement('tr')
    const mes = p.mes
      ? new Date(p.mes + 'T12:00:00').toLocaleDateString('es-MX', { year: 'numeric', month: 'long' })
      : '—'
    const fechaPago = p.fecha_pago
      ? new Date(p.fecha_pago).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—'
    const badgeClass = p.estado === 'pagado'   ? 'badge-pagado'
                     : p.estado === 'vencido'  ? 'badge-vencido'
                     : 'badge-pendiente'

    tr.innerHTML = `
      <td>${mes}</td>
      <td><strong>$${Number(p.monto || 0).toLocaleString('es-MX')}</strong></td>
      <td><span class="${badgeClass}">${p.estado || 'pendiente'}</span></td>
      <td>${p.metodo || '—'}</td>
      <td>${fechaPago}</td>`
    body.appendChild(tr)
  })
}

iniciar()
