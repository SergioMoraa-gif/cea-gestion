// ================================
// backup-db.js
// Respaldo de SOLO LECTURA de todas las tablas de Supabase a archivos JSON
// locales. Este script NUNCA escribe, actualiza ni borra nada en la base
// de datos — únicamente hace SELECT * de cada tabla y guarda el resultado.
//
// Uso:
//   node scripts/backup-db.js
//
// Genera una carpeta backups/<fecha-hora>/ con un archivo .json por tabla.
// ================================

require('dotenv').config()
const fs       = require('fs')
const path     = require('path')
const supabase = require('../src/config/db')

// Todas las tablas detectadas en los controladores del sistema.
const TABLAS = [
  'Estudiantes',
  'Maestros',
  'HorariosAlumnos',
  'EstudiantesClases',
  'Clases',
  'Pagos'
]

function timestamp() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
}

async function respaldarTabla(nombre, dirDestino) {
  // Solo SELECT. Sin filtros, para traer absolutamente todas las filas
  // (activas e inactivas), tal cual están hoy.
  const { data, error, count } = await supabase
    .from(nombre)
    .select('*', { count: 'exact' })

  if (error) {
    console.error(`  ❌ ${nombre}: ${error.message}`)
    return { nombre, ok: false, error: error.message }
  }

  const archivo = path.join(dirDestino, `${nombre}.json`)
  fs.writeFileSync(archivo, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`  ✅ ${nombre}: ${data.length} fila(s) -> ${archivo}`)
  return { nombre, ok: true, filas: data.length }
}

async function main() {
  const carpeta = path.join(__dirname, '..', 'backups', timestamp())
  fs.mkdirSync(carpeta, { recursive: true })

  console.log(`\n📦 Iniciando respaldo de SOLO LECTURA en: ${carpeta}\n`)

  const resumen = []
  for (const tabla of TABLAS) {
    resumen.push(await respaldarTabla(tabla, carpeta))
  }

  const fallidas = resumen.filter(r => !r.ok)
  console.log('\n──────────────────────────────')
  if (fallidas.length > 0) {
    console.log(`⚠️  Respaldo completado con ${fallidas.length} tabla(s) con error.`)
    process.exitCode = 1
  } else {
    console.log('✅ Respaldo completado sin errores.')
  }
}

main().catch(err => {
  console.error('\n❌ ERROR inesperado:', err.message)
  process.exit(1)
})
