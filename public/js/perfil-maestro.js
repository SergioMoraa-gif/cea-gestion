// ================================
// perfil-maestro.js — CEA Sistema de Gestión
// Refactorizado: HorariosAlumnos + EstudiantesClases
// id → id_maestro, id → id_estudiante, id → id_clase
// hora_fin → hora_final (se recibe normalizado como hora_fin desde el controller)
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
const MODALIDAD_DIAS = { LM: ['lunes','miercoles'], MJ: ['martes','jueves'], viernes: ['viernes'], sabado: ['sabado'] }

// Bloques 9:00AM a 8:00PM cada 30 min
const BLOQUES = []
for (let h = 9; h <= 19; h++) {
  BLOQUES.push(`${String(h).padStart(2,'0')}:00`)
  BLOQUES.push(`${String(h).padStart(2,'0')}:30`)
}
BLOQUES.push('20:00')

let maestrosData    = []
let estudiantesData = []
let clasesData      = []
let horariosData    = []
let maestroActual   = null

// Estado asignación
let modoAsignando         = false
let estudianteAsignar     = null
let pasoAsignacion        = 0
let diasAsignacion        = []
let primerHorarioGuardado = null

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
    const [resMaestros, resEst, resClases] = await Promise.all([
      fetch('/api/maestros',    { headers }),
      fetch('/api/estudiantes', { headers }),
      fetch('/api/clases',      { headers })
    ])
    maestrosData    = ((await resMaestros.json()).maestros || []).filter(m => m.activo !== false)
    estudiantesData = (await resEst.json()).estudiantes || []
    clasesData      = (await resClases.json()).clases    || []

    const sel = document.getElementById('selectorMaestro')
    sel.innerHTML = ''
    maestrosData.forEach(m => {
      const opt = document.createElement('option')
      opt.value = m.id_maestro; opt.textContent = m.nombre   // ← id_maestro
      if (m.id_maestro === maestroId) opt.selected = true
      sel.appendChild(opt)
    })

    if (!maestroId && maestrosData.length > 0) maestroId = maestrosData[0].id_maestro
    maestroActual = maestrosData.find(m => m.id_maestro === maestroId)
    actualizarTitulo()

    if (nuevoEstId) {
      // El controller devuelve id_estudiante
      estudianteAsignar = estudiantesData.find(e => e.id_estudiante === nuevoEstId)
      if (estudianteAsignar) activarModoAsignando()
    }

    await cargarHorarios()
  } catch (err) {
    document.getElementById('loadingCal').textContent = 'Error al cargar el calendario.'
  }
}

// --- Cargar horarios ---
// El endpoint sigue siendo /api/horarios/maestro/:id
// Pero ahora es atendido por inscripciones.controller → porMaestro
async function cargarHorarios() {
  document.getElementById('loadingCal').style.display       = 'block'
  document.getElementById('calendarioScroll').style.display = 'none'
  try {
    const res  = await fetch(`/api/horarios/maestro/${maestroId}`, { headers })
    const data = await res.json()
    horariosData = data.horarios || []
    renderizarCalendario()
  } catch (err) {
    document.getElementById('loadingCal').textContent = 'Error al cargar horarios.'
  }
}

// --- Renderizar calendario ---
// horariosData ya viene normalizado: { id, estudiante_id, clase_id, dia, hora_inicio, hora_fin }
function renderizarCalendario() {
  const diasMaestro = maestroActual ? (maestroActual.dias_trabajo || DIAS) : DIAS
  const diasMostrar = DIAS.filter(d => diasMaestro.includes(d))
  const diaEsperado = modoAsignando ? diasAsignacion[pasoAsignacion] : null

  const head = document.getElementById('calendarioHead')
  const body = document.getElementById('calendarioBody')

  head.innerHTML = `<tr>
    <th>Hora</th>
    ${diasMostrar.map(d => {
      const es = diaEsperado === d
      return `<th class="dia-activo${es ? ' dia-esperado' : ''}">${DIAS_LABEL[DIAS.indexOf(d)]}</th>`
    }).join('')}
  </tr>`

  body.innerHTML = ''

  // Mapa: "dia_hora_inicio" → array de horarios
  const mapa = {}
  horariosData.forEach(h => {
    const key = `${h.dia}_${h.hora_inicio}`
    if (!mapa[key]) mapa[key] = []
    mapa[key].push(h)
  })

  // Calcular celdas a saltar por clases grupales (rowspan de 3 = 1 hora = 2 bloques + la actual)
  const saltarCelda = new Set()
  horariosData.forEach(h => {
    const clase = clasesData.find(c => c.id_clase === h.clase_id)   // ← id_clase
    if (clase && clase.tipo === 'grupal') {
      const [hh, mm] = h.hora_inicio.split(':').map(Number)
      for (const delta of [30, 60]) {
        const tot = hh * 60 + mm + delta
        const key = `${h.dia}_${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`
        saltarCelda.add(key)
      }
    }
  })

  const colorMap = {}
  let ci = 0
  clasesData.forEach(c => { colorMap[c.id_clase] = COLORES[ci++ % COLORES.length] })  // ← id_clase

  BLOQUES.forEach(hora => {
    const tr   = document.createElement('tr')
    const tdH  = document.createElement('td')
    tdH.className = 'td-hora'; tdH.textContent = hora
    tr.appendChild(tdH)

    diasMostrar.forEach(dia => {
      const keyFull = `${dia}_${hora}:00`
      if (saltarCelda.has(keyFull)) return

      const td    = document.createElement('td')
      td.className = 'td-bloque'
      const bloqs = mapa[keyFull] || []

      if (bloqs.length > 0) {
        const esGrupal = bloqs.some(b => {
          const cl = clasesData.find(c => c.id_clase === b.clase_id)
          return cl && cl.tipo === 'grupal'
        })
        if (esGrupal) td.rowSpan = 3

        bloqs.forEach(b => {
          // El controller devuelve estudiante_id y clase_id como aliases
          const est   = estudiantesData.find(e => e.id_estudiante === b.estudiante_id)
          const clase = clasesData.find(c => c.id_clase === b.clase_id)
          const div   = document.createElement('div')
          div.className = `bloque-alumno ${colorMap[b.clase_id] || 'color-0'}${esGrupal ? ' bloque-hora-completa' : ''}`
          div.innerHTML = `<div class="al-nombre">${est ? est.nombre : '—'}</div><div class="al-clase">${clase ? clase.nombre : ''}</div>`
          div.addEventListener('click', () => abrirModalBloque(b, dia, hora, bloqs, colorMap))
          td.appendChild(div)
        })
      } else {
        const div = document.createElement('div')
        const esDiaActivo = modoAsignando && dia === diaEsperado
        div.className = `bloque-vacio${modoAsignando ? (esDiaActivo ? ' asignando-activo' : ' asignando-inactivo') : ''}`
        if (esDiaActivo) div.addEventListener('click', () => seleccionarBloque(dia, hora))
        td.appendChild(div)
      }
      tr.appendChild(td)
    })
    body.appendChild(tr)
  })

  document.getElementById('loadingCal').style.display       = 'none'
  document.getElementById('calendarioScroll').style.display = 'block'
}

// --- Modo asignando ---
function activarModoAsignando() {
  if (!estudianteAsignar) return
  // El controller devuelve id_clase como alias de clase_id
  const clase     = clasesData.find(c => c.id_clase === (estudianteAsignar.id_clase || estudianteAsignar.clase_id))
  const modalidad = clase ? clase.modalidad : 'viernes'
  diasAsignacion  = MODALIDAD_DIAS[modalidad] || ['viernes']
  pasoAsignacion  = 0
  modoAsignando   = true
  actualizarBanner()
}

function actualizarBanner() {
  document.getElementById('bannerNuevo').style.display = 'flex'
  const diaLabel = DIAS_LABEL[DIAS.indexOf(diasAsignacion[pasoAsignacion])]
  const total    = diasAsignacion.length
  const paso     = pasoAsignacion + 1
  document.getElementById('bannerTexto').innerHTML =
    `Asignando a <strong>${estudianteAsignar.nombre}</strong> — ${total > 1 ? `Paso ${paso} de ${total}: ` : ''}Selecciona el horario del <strong>${diaLabel}</strong>`
}

document.getElementById('btnCancelarAsign').addEventListener('click', async () => {
  if (primerHorarioGuardado) {
    await fetch(`/api/horarios/${primerHorarioGuardado}`, { method: 'DELETE', headers })
    primerHorarioGuardado = null
  }
  cancelarAsignacion()
})

function cancelarAsignacion() {
  modoAsignando = false; estudianteAsignar = null
  pasoAsignacion = 0; diasAsignacion = []; primerHorarioGuardado = null
  document.getElementById('bannerNuevo').style.display = 'none'
  renderizarCalendario()
}

// --- Seleccionar bloque ---
function seleccionarBloque(dia, hora) {
  const clase    = clasesData.find(c => c.id_clase === (estudianteAsignar.id_clase || estudianteAsignar.clase_id))
  const duracion = clase && clase.tipo === 'grupal' ? '1 hora' : '30 min'
  document.getElementById('modalAsignarDesc').innerHTML =
    `Asignar a <strong>${estudianteAsignar.nombre}</strong> el <strong>${DIAS_LABEL[DIAS.indexOf(dia)]}</strong> a las <strong>${hora}</strong> (${duracion})`
  document.getElementById('modalAsignar').dataset.dia  = dia
  document.getElementById('modalAsignar').dataset.hora = hora
  document.getElementById('modalAsignar').style.display = 'flex'
}

document.getElementById('modalAsignarCancelar').addEventListener('click', () => {
  document.getElementById('modalAsignar').style.display = 'none'
})

document.getElementById('modalAsignarConfirmar').addEventListener('click', async () => {
  const modal = document.getElementById('modalAsignar')
  const dia   = modal.dataset.dia
  const hora  = modal.dataset.hora
  if (!dia || !hora || !estudianteAsignar) return

  const btn = document.getElementById('modalAsignarConfirmar')
  btn.disabled = true
  btn.querySelector('.btn-text').style.display   = 'none'
  btn.querySelector('.btn-loader').style.display = 'flex'

  const claseId = estudianteAsignar.id_clase || estudianteAsignar.clase_id
  const clase   = clasesData.find(c => c.id_clase === claseId)
  const durMin  = clase && clase.tipo === 'grupal' ? 60 : 30
  const [hh, mm] = hora.split(':').map(Number)
  const tot      = hh * 60 + mm + durMin
  const horaFin  = `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}:00`

  try {
    // Endpoint /api/horarios → inscripciones.controller.crear
    const res  = await fetch('/api/horarios', {
      method: 'POST', headers,
      body: JSON.stringify({
        estudiante_id: estudianteAsignar.id_estudiante,  // ← id_estudiante
        maestro_id:    maestroId,
        clase_id:      claseId,
        dia,
        hora_inicio: hora + ':00',
        hora_fin:    horaFin
      })
    })
    const data = await res.json()
    if (!res.ok) { alert(data.message || 'Error al asignar.'); return }

    modal.style.display = 'none'

    if (diasAsignacion.length > 1 && pasoAsignacion === 0) {
      primerHorarioGuardado = data.horario.id
      pasoAsignacion = 1
      await cargarHorarios()
      actualizarBanner()
    } else {
      primerHorarioGuardado = null
      await cargarHorarios()
      cancelarAsignacion()
    }
  } catch (err) {
    alert('Error de conexión.')
  } finally {
    btn.disabled = false
    btn.querySelector('.btn-text').style.display   = 'inline'
    btn.querySelector('.btn-loader').style.display = 'none'
  }
})

// --- Modal bloque → lista de alumnos ---
function abrirModalBloque(horario, dia, hora, todosLosBloques, colorMap) {
  const clase = clasesData.find(c => c.id_clase === horario.clase_id)
  document.getElementById('modalBloqueHora').textContent  = `${DIAS_LABEL[DIAS.indexOf(dia)]} · ${hora}`
  document.getElementById('modalBloqueClase').textContent = clase ? `${clase.nombre} · ${clase.tipo === 'grupal' ? 'Grupal' : 'Individual'}` : '—'

  const lista = document.getElementById('modalBloqueListaAlumnos')
  lista.innerHTML = ''
  todosLosBloques.forEach(b => {
    const est = estudiantesData.find(e => e.id_estudiante === b.estudiante_id)
    const li  = document.createElement('div')
    li.className = 'bloque-alumno-item'
    li.innerHTML = `
      <div class="item-dot ${colorMap[b.clase_id] || 'color-0'}"></div>
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
      const est  = estudiantesData.find(e => e.id_estudiante === h.estudiante_id)
      const cl   = clasesData.find(c => c.id_clase === h.clase_id)
      contenido += `${h.hora_inicio.slice(0,5)} — ${est ? est.nombre : '?'} (${cl ? cl.nombre : '?'})\n`
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
