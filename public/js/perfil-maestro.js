// ================================
// perfil-maestro.js — CEA Sistema de Gestión
// Sin clases — al clic en bloque pregunta tipo (individual/grupal) y duración (30/60)
// ================================

const token = sessionStorage.getItem('cea_token')
if (!token) window.location.href = 'index.html'

const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }

const params     = new URLSearchParams(window.location.search)
let maestroId    = parseInt(params.get('id')) || null
const nuevoEstId = params.get('nuevo') ? parseInt(params.get('nuevo')) : null

const DIAS       = ['lunes','martes','miercoles','jueves','viernes','sabado']
const DIAS_LABEL = ['Lunes','Martes','Miérc.','Jueves','Viernes','Sábado']
const COLORES    = ['color-0','color-1','color-2','color-3','color-4','color-5']

const BLOQUES = []
for (let h = 9; h <= 19; h++) {
  BLOQUES.push(`${String(h).padStart(2,'0')}:00`)
  BLOQUES.push(`${String(h).padStart(2,'0')}:30`)
}
BLOQUES.push('20:00')

let maestrosData    = []
let estudiantesData = []
let horariosData    = []
let maestroActual   = null
let estudianteAsignar = null

// Bloque seleccionado al clic
let bloqueSelDia  = null
let bloqueSelHora = null

// Opciones del modal de asignación
let tipoSeleccionado    = 'individual'
let duracionSeleccionada = 30

// --- Sidebar ---
const sidebar         = document.getElementById('sidebar')
const sidebarBackdrop = document.getElementById('sidebarBackdrop')
document.getElementById('btnMenu').addEventListener('click', () => { sidebar.classList.add('open'); sidebarBackdrop.classList.add('show') })
document.getElementById('sidebarClose').addEventListener('click', () => { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') })
sidebarBackdrop.addEventListener('click', () => { sidebar.classList.remove('open'); sidebarBackdrop.classList.remove('show') })
document.getElementById('btnLogout').addEventListener('click', () => { sessionStorage.clear(); window.location.href = 'index.html' })

// --- Selector de maestro ---
document.getElementById('selectorMaestro').addEventListener('change', function () {
  maestroId     = parseInt(this.value)
  maestroActual = maestrosData.find(m => m.id_maestro === maestroId)
  actualizarTitulo()
  cargarHorarios()
})

function actualizarTitulo() {
  if (!maestroActual) return
  document.getElementById('tituloMaestro').textContent    = maestroActual.nombre
  document.getElementById('subtituloMaestro').textContent = (maestroActual.dias_trabajo || [])
    .map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')
}

// --- Iniciar ---
async function iniciar() {
  try {
    const [resMaestros, resEst] = await Promise.all([
      fetch('/api/maestros',    { headers }),
      fetch('/api/estudiantes', { headers })
    ])
    maestrosData    = ((await resMaestros.json()).maestros || []).filter(m => m.activo !== false)
    estudiantesData = (await resEst.json()).estudiantes || []

    const sel = document.getElementById('selectorMaestro')
    sel.innerHTML = ''
    maestrosData.forEach(m => {
      const opt = document.createElement('option')
      opt.value = m.id_maestro; opt.textContent = m.nombre
      if (m.id_maestro === maestroId) opt.selected = true
      sel.appendChild(opt)
    })

    if (!maestroId && maestrosData.length > 0) maestroId = maestrosData[0].id_maestro
    maestroActual = maestrosData.find(m => m.id_maestro === maestroId)
    actualizarTitulo()

    if (nuevoEstId) {
      estudianteAsignar = estudiantesData.find(e => e.id_estudiante === nuevoEstId)
      if (estudianteAsignar) activarBanner()
    }

    await cargarHorarios()
  } catch (err) {
    document.getElementById('loadingCal').textContent = 'Error al cargar el calendario.'
  }
}

// --- Banner modo asignación ---
function activarBanner() {
  const banner = document.getElementById('bannerNuevo')
  banner.style.display = 'flex'
  document.getElementById('bannerTexto').innerHTML =
    `Asignando horario a <strong>${estudianteAsignar.nombre}</strong> — Da clic en un bloque vacío`
}

document.getElementById('btnCancelarAsign').addEventListener('click', () => {
  estudianteAsignar = null
  document.getElementById('bannerNuevo').style.display = 'none'
  renderizarCalendario()
  // Regresar a estudiantes
  window.location.href = `estudiantes.html?regreso=${nuevoEstId}`
})

// --- Cargar horarios ---
async function cargarHorarios() {
  document.getElementById('loadingCal').style.display       = 'block'
  document.getElementById('calendarioScroll').style.display = 'none'
  try {
    const res    = await fetch(`/api/horarios/maestro/${maestroId}`, { headers })
    const data   = await res.json()
    horariosData = data.horarios || []
    renderizarCalendario()
  } catch (err) {
    document.getElementById('loadingCal').textContent = 'Error al cargar horarios.'
  }
}

// --- Renderizar calendario ---
function renderizarCalendario() {
  const diasMaestro = maestroActual ? (maestroActual.dias_trabajo || DIAS) : DIAS
  const diasMostrar = DIAS.filter(d => diasMaestro.includes(d))

  const head = document.getElementById('calendarioHead')
  const body = document.getElementById('calendarioBody')

  head.innerHTML = `<tr>
    <th>Hora</th>
    ${diasMostrar.map(d => `<th class="dia-activo">${DIAS_LABEL[DIAS.indexOf(d)]}</th>`).join('')}
  </tr>`
  body.innerHTML = ''

  // Mapa de horarios
  const mapa = {}
  horariosData.forEach(h => {
    const key = `${h.dia}_${h.hora_inicio}`
    if (!mapa[key]) mapa[key] = []
    mapa[key].push(h)
  })

  // Celdas a saltar por bloques de 60 min (rowspan 3)
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

  // Color por estudiante
  const colorMap = {}
  let ci = 0
  estudiantesData.forEach(e => { colorMap[e.id_estudiante] = COLORES[ci++ % COLORES.length] })

  BLOQUES.forEach(hora => {
    const tr  = document.createElement('tr')
    const tdH = document.createElement('td')
    tdH.className = 'td-hora'; tdH.textContent = hora
    tr.appendChild(tdH)

    diasMostrar.forEach(dia => {
      const keyFull = `${dia}_${hora}:00`
      if (saltarCelda.has(keyFull)) return

      const td    = document.createElement('td')
      td.className = 'td-bloque'
      const bloqs  = mapa[keyFull] || []

      if (bloqs.length > 0) {
        const esGrupal = bloqs.some(b => b.tipo === 'grupal' || b.duracion === 60)
        if (esGrupal) td.rowSpan = 3

        bloqs.forEach(b => {
          const est = estudiantesData.find(e => e.id_estudiante === b.estudiante_id)
          const div = document.createElement('div')
          div.className = `bloque-alumno ${colorMap[b.estudiante_id] || 'color-0'}${esGrupal ? ' bloque-hora-completa' : ''}`
          div.innerHTML = `
            <div class="al-nombre">${est ? est.nombre : '—'}</div>
            <div class="al-clase">${b.tipo === 'grupal' ? 'Grupal' : 'Individual'} · ${b.duracion || 30} min</div>`
          div.addEventListener('click', () => abrirModalBloque(b, dia, hora, bloqs, colorMap))
          td.appendChild(div)
        })
      } else {
        const div = document.createElement('div')
        div.className = `bloque-vacio${estudianteAsignar ? ' asignando-activo' : ''}`
        if (estudianteAsignar) {
          div.addEventListener('click', () => abrirModalAsignar(dia, hora))
        }
        td.appendChild(div)
      }
      tr.appendChild(td)
    })
    body.appendChild(tr)
  })

  document.getElementById('loadingCal').style.display       = 'none'
  document.getElementById('calendarioScroll').style.display = 'block'
}

// --- Modal asignar bloque ---
function abrirModalAsignar(dia, hora) {
  bloqueSelDia  = dia
  bloqueSelHora = hora
  tipoSeleccionado     = 'individual'
  duracionSeleccionada = 30

  document.getElementById('modalAsignarAlumno').textContent =
    estudianteAsignar ? estudianteAsignar.nombre : '—'
  document.getElementById('modalAsignarDia').textContent =
    `${DIAS_LABEL[DIAS.indexOf(dia)]} · ${hora}`

  actualizarBotonesTipo('individual')
  actualizarBotonesDuracion(30)

  document.getElementById('modalAsignar').style.display = 'flex'
}

function actualizarBotonesTipo(tipo) {
  tipoSeleccionado = tipo
  document.querySelectorAll('.btn-tipo').forEach(b => b.classList.toggle('activo', b.dataset.val === tipo))
}

function actualizarBotonesDuracion(dur) {
  duracionSeleccionada = dur
  document.querySelectorAll('.btn-duracion').forEach(b => b.classList.toggle('activo', parseInt(b.dataset.val) === dur))
}

document.querySelectorAll('.btn-tipo').forEach(b =>
  b.addEventListener('click', () => actualizarBotonesTipo(b.dataset.val))
)
document.querySelectorAll('.btn-duracion').forEach(b =>
  b.addEventListener('click', () => actualizarBotonesDuracion(parseInt(b.dataset.val)))
)

document.getElementById('modalAsignarCancelar').addEventListener('click', () => {
  document.getElementById('modalAsignar').style.display = 'none'
})

document.getElementById('modalAsignarConfirmar').addEventListener('click', async () => {
  if (!bloqueSelDia || !bloqueSelHora) return

  const btn = document.getElementById('modalAsignarConfirmar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  const durMin  = duracionSeleccionada
  const [hh, mm] = bloqueSelHora.split(':').map(Number)
  const tot      = hh * 60 + mm + durMin
  const horaFin  = `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`

  try {
    const res = await fetch('/api/horarios', {
      method: 'POST', headers,
      body: JSON.stringify({
        estudiante_id: estudianteAsignar ? estudianteAsignar.id_estudiante : null,
        maestro_id:    maestroId,
        dia:           bloqueSelDia,
        hora_inicio:   bloqueSelHora + ':00',
        hora_fin:      horaFin,
        tipo:          tipoSeleccionado,
        duracion:      duracionSeleccionada
      })
    })
    const data = await res.json()
    if (!res.ok) { alert(data.message || 'Error al asignar.'); return }

    document.getElementById('modalAsignar').style.display = 'none'
    await cargarHorarios()
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// --- Modal bloque ocupado ---
function abrirModalBloque(horario, dia, hora, todosLosBloques, colorMap) {
  document.getElementById('modalBloqueHora').textContent  = `${DIAS_LABEL[DIAS.indexOf(dia)]} · ${hora}`
  document.getElementById('modalBloqueClase').textContent =
    `${horario.tipo === 'grupal' ? 'Grupal' : 'Individual'} · ${horario.duracion || 30} min`

  const lista = document.getElementById('modalBloqueListaAlumnos')
  lista.innerHTML = ''
  todosLosBloques.forEach(b => {
    const est = estudiantesData.find(e => e.id_estudiante === b.estudiante_id)
    const li  = document.createElement('div')
    li.className = 'bloque-alumno-item'
    li.innerHTML = `
      <div class="item-dot ${colorMap[b.estudiante_id] || 'color-0'}"></div>
      <span class="item-nombre">${est ? est.nombre : '—'}</span>
      <div class="item-acciones">
        <button class="btn-item-perfil" onclick="verPerfilDesdeBloque(${b.estudiante_id})">Ver perfil</button>
      </div>`
    lista.appendChild(li)
  })
  document.getElementById('modalBloque').style.display = 'flex'
}

window.verPerfilDesdeBloque = (id) => {
  document.getElementById('modalBloque').style.display = 'none'
  window.location.href = `estudiantes.html?highlight=${id}`
}

document.getElementById('modalBloqueCerrar').addEventListener('click', () => {
  document.getElementById('modalBloque').style.display = 'none'
})

// --- Descargar lista ---
document.getElementById('btnDescargar').addEventListener('click', () => {
  if (!maestroActual) return
  let contenido = `LISTA DE HORARIOS — ${maestroActual.nombre}\n${'='.repeat(40)}\n\n`
  ;(maestroActual.dias_trabajo || DIAS).forEach(dia => {
    const del = horariosData.filter(h => h.dia === dia)
    if (!del.length) return
    contenido += `${dia.toUpperCase()}\n${'-'.repeat(20)}\n`
    del.sort((a,b) => a.hora_inicio.localeCompare(b.hora_inicio)).forEach(h => {
      const est = estudiantesData.find(e => e.id_estudiante === h.estudiante_id)
      contenido += `${h.hora_inicio.slice(0,5)} — ${est ? est.nombre : '?'} (${h.tipo} · ${h.duracion}min)\n`
    })
    contenido += '\n'
  })
  const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `horario-${maestroActual.nombre.replace(/\s+/g,'-')}.txt`
  a.click(); URL.revokeObjectURL(url)
})

iniciar()