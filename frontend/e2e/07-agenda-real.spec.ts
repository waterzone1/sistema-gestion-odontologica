import { expect, test, type Page } from '@playwright/test'
import { ADMIN_PASSWORD, ADMIN_USERNAME, apiLogin, ODONTOLOGO, provisionUser, RECEPCION } from './api'

test.describe.configure({ mode: 'serial' })

const captura = (nombre: string) => `test-results/screens/${nombre}.png`
const pad = (n: number) => String(n).padStart(2, '0')
const fechaTexto = (fecha: Date) => `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()}`
const ADMIN = { username: ADMIN_USERNAME, password: ADMIN_PASSWORD }
const GOMEZ = { username: 'odontologa2', password: 'Clave-de-ana-2026', displayName: 'Dra. Ana Gómez' }

const proximoLunes = (() => {
  const fecha = new Date()
  fecha.setHours(0, 0, 0, 0)
  fecha.setDate(fecha.getDate() + (((8 - fecha.getDay()) % 7) || 7))
  return fecha
})()

async function ingresar(page: Page, usuario: { username: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(usuario.username)
  await page.getByLabel('Contraseña').fill(usuario.password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function turnoParaGomez(page: Page, hora: string) {
  await page.goto('/agenda')
  await page.getByRole('button', { name: 'Nuevo turno' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Paciente').fill('rossi')
  await dialogo.getByRole('button', { name: /Rossi, Luca/ }).click()
  await dialogo.getByLabel('Profesional').selectOption({ label: GOMEZ.displayName })
  await dialogo.getByLabel('Fecha', { exact: true }).fill(fechaTexto(proximoLunes))
  await dialogo.getByLabel('Hora', { exact: true }).fill(hora)
  await dialogo.getByRole('button', { name: 'Crear turno' }).click()
  return dialogo
}

test.beforeAll(async () => {
  const admin = await apiLogin(ADMIN_USERNAME, ADMIN_PASSWORD)
  const sedes = (await (await admin.get('/api/branches')).json()) as { id: string }[]
  await provisionUser(admin, {
    username: GOMEZ.username,
    displayName: GOMEZ.displayName,
    roles: ['DENTIST'],
    branchIds: [sedes[0]?.id ?? ''],
    password: GOMEZ.password,
    licenseNumber: 'MP-200',
  })
  await admin.dispose()
})

test('el administrador carga el horario semanal de la profesional', async ({ page }) => {
  await ingresar(page, ADMIN)
  await page.goto('/professionals')
  await page.getByRole('link', { name: new RegExp(GOMEZ.displayName) }).click()
  const lunes = page.getByRole('listitem').filter({ hasText: 'Lunes' })
  await lunes.getByRole('button', { name: 'Agregar franja' }).click()
  await expect(lunes.getByLabel('Lunes: desde')).toHaveValue('09:00')
  await lunes.getByLabel('Lunes: hasta').fill('1300')
  await page.screenshot({ path: captura('27-horario-semanal'), fullPage: true })
  await page.getByRole('button', { name: 'Guardar horario' }).click()
  await expect(page.getByText('Horario guardado.')).toBeVisible()
})

test('fuera del horario avisa y recepción puede dar el turno igual', async ({ page }) => {
  await ingresar(page, RECEPCION)
  const dialogo = await turnoParaGomez(page, '15:00')
  await expect(dialogo.getByText('Fuera del horario de atención del profesional en esa sede')).toBeVisible()
  const crear = dialogo.getByRole('button', { name: 'Crear turno' })
  await expect(crear).toBeDisabled()
  await page.screenshot({ path: captura('28-advertencia-fuera-de-horario') })
  await dialogo.getByLabel('Hora', { exact: true }).fill('10:00')
  await expect(dialogo.getByText('Fuera del horario de atención del profesional en esa sede')).toHaveCount(0)
  await crear.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const otro = await turnoParaGomez(page, '15:00')
  await otro.getByLabel('Dar el turno igual').check()
  await otro.getByRole('button', { name: 'Crear turno' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('recepción administra el horario y carga vacaciones', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await page.goto('/professionals')
  await page.getByRole('link', { name: new RegExp(GOMEZ.displayName) }).click()
  await expect(page.getByRole('button', { name: 'Guardar horario' })).toBeVisible()
  await page.getByRole('tab', { name: 'Datos' }).click()
  await page.getByRole('radio', { name: 'Violeta' }).click()
  await page.getByRole('button', { name: 'Guardar datos' }).click()
  await expect(page.getByText('Datos guardados.')).toBeVisible()
  await page.getByRole('tab', { name: 'Excepciones' }).click()
  await page.getByRole('button', { name: 'Nueva excepción' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Tipo').selectOption({ label: 'Vacaciones' })
  await dialogo.getByLabel('Desde (fecha)').fill(fechaTexto(proximoLunes))
  await dialogo.getByLabel('Hasta (fecha)').fill(fechaTexto(proximoLunes))
  await dialogo.getByLabel('Motivo').fill('Congreso de odontología')
  await dialogo.getByRole('button', { name: 'Guardar excepción' }).click()
  await expect(page.getByText('Hay turnos dentro de ese período')).toBeVisible()
  await expect(page.getByText('Congreso de odontología')).toBeVisible()
  await page.screenshot({ path: captura('30-excepciones'), fullPage: true })
})

test('durante las vacaciones solo el administrador puede forzar un turno, con motivo', async ({ page }) => {
  await ingresar(page, RECEPCION)
  const deRecepcion = await turnoParaGomez(page, '11:00')
  await expect(deRecepcion.getByText(/El profesional no atiende en ese horario: vacaciones/)).toBeVisible()
  await expect(deRecepcion.getByLabel('Dar el turno igual aunque el profesional no atienda')).toHaveCount(0)
  await page.context().clearCookies()

  await ingresar(page, ADMIN)
  const dialogo = await turnoParaGomez(page, '11:00')
  await expect(dialogo.getByText(/El profesional no atiende en ese horario: vacaciones/)).toBeVisible()
  await dialogo.getByLabel('Dar el turno igual aunque el profesional no atienda').fill('Urgencia por dolor agudo')
  await page.screenshot({ path: captura('29-override') })
  await dialogo.getByRole('button', { name: 'Crear turno' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)

  await page.goto('/agenda')
  await page.getByLabel('Ir a la fecha').fill(fechaTexto(proximoLunes))
  await page.getByRole('button', { name: 'Ir', exact: true }).click()
  await expect(page.getByText(`${GOMEZ.displayName} · Vacaciones`)).toBeVisible()
  await page.screenshot({ path: captura('31b-agenda-avisos-y-colores'), fullPage: true })
})

test('el inicio de recepción lista los turnos de mañana para confirmar', async ({ page }) => {
  const admin = await apiLogin(ADMIN_USERNAME, ADMIN_PASSWORD)
  const profesionales = (await (await admin.get('/api/professionals')).json()) as { id: string; displayName: string }[]
  const sedes = (await (await admin.get('/api/branches')).json()) as { id: string }[]
  const pacientes = (await (await admin.get('/api/patients?q=rossi')).json()) as { items: { id: string }[] }
  const inicio = new Date()
  inicio.setDate(inicio.getDate() + 1)
  inicio.setHours(17, 0, 0, 0)
  const creado = await admin.post('/api/appointments', {
    patientId: pacientes.items[0]?.id,
    professionalId: profesionales.find((p) => p.displayName === ODONTOLOGO.displayName)?.id,
    branchId: sedes[0]?.id,
    startsAt: inicio.toISOString(),
    endsAt: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
  })
  expect(creado.status()).toBe(201)
  await admin.dispose()

  await ingresar(page, RECEPCION)
  const lista = page.getByRole('region', { name: 'Para confirmar mañana' })
  const fila = lista.getByRole('listitem').filter({ hasText: '17:00' })
  await expect(fila.getByText('Rossi, Luca')).toBeVisible()
  await page.screenshot({ path: captura('31-confirmar-manana'), fullPage: true })
  await fila.getByRole('button', { name: 'Confirmar' }).click()
  await expect(lista.getByRole('listitem').filter({ hasText: '17:00' })).toHaveCount(0)
})

test('arrastrar un turno pide confirmación y respeta la disponibilidad', async ({ page }) => {
  await ingresar(page, ADMIN)
  await page.goto('/agenda')
  await page.getByLabel('Profesional').selectOption({ label: GOMEZ.displayName })
  await page.getByLabel('Ir a la fecha').fill(fechaTexto(proximoLunes))
  await page.getByRole('button', { name: 'Ir', exact: true }).click()
  const turno = page.locator('.fc-timegrid-event').filter({ hasText: '10:00 Rossi, Luca' })
  const caja = await turno.boundingBox()
  if (!caja) throw new Error('no se encontro el turno en la grilla')
  await page.mouse.move(caja.x + caja.width / 2, caja.y + 5)
  await page.mouse.down()
  await page.mouse.move(caja.x + caja.width / 2, caja.y + 50, { steps: 10 })
  await page.mouse.up()

  const dialogo = page.getByRole('dialog', { name: 'Reprogramar turno' })
  await expect(dialogo).toBeVisible()
  await dialogo.getByRole('button', { name: 'Reprogramar' }).click()
  await expect(dialogo.getByText(/El profesional no atiende en ese horario: vacaciones/)).toBeVisible()
  await page.screenshot({ path: captura('32-arrastrar-turno') })
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.locator('.fc-timegrid-event').filter({ hasText: '10:00 Rossi, Luca' })).toBeVisible()
})
