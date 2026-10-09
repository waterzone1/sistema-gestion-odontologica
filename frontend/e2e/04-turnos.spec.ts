import { expect, test, type Locator, type Page } from '@playwright/test'
import { ADMIN_PASSWORD, ADMIN_USERNAME, apiLogin, ODONTOLOGO, RECEPCION } from './api'

test.describe.configure({ mode: 'serial' })

const captura = (nombre: string) => `test-results/screens/${nombre}.png`
const pad = (n: number) => String(n).padStart(2, '0')
const fechaTexto = (fecha: Date) => `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()}`
const horaTexto = (fecha: Date) => `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`

async function elegirHorario(dialogo: Locator, inicio: Date) {
  await dialogo.getByLabel('Fecha', { exact: true }).fill(fechaTexto(inicio))
  await dialogo.getByLabel('Hora', { exact: true }).fill(horaTexto(inicio))
}

const manana = (hora: number, minuto = 0) => {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + 1)
  fecha.setHours(hora, minuto, 0, 0)
  return fecha
}

let page: Page

async function abrirTurnosDeRossi(target: Page) {
  await target.goto('/patients')
  await target.getByLabel('Buscar paciente').fill('rossi')
  await target.getByRole('link', { name: 'Rossi, Luca' }).click()
  await target.getByRole('tab', { name: 'Turnos' }).click()
}

async function nuevoTurno(target: Page, inicio: Date) {
  await target.getByRole('button', { name: 'Nuevo turno' }).click()
  const dialogo = target.getByRole('dialog')
  await dialogo.getByLabel('Profesional').selectOption({ label: ODONTOLOGO.displayName })
  await dialogo.getByLabel('Práctica').selectOption({ label: 'Consulta (30 min)' })
  await elegirHorario(dialogo, inicio)
  return dialogo
}

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage()
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(RECEPCION.username)
  await page.getByLabel('Contraseña').fill(RECEPCION.password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test.afterAll(async () => {
  await page.context().close()
})

test('recepción crea un turno desde la ficha del paciente', async () => {
  await abrirTurnosDeRossi(page)
  await expect(page.getByText('No tiene turnos próximos.')).toBeVisible()

  const dialogo = await nuevoTurno(page, manana(10))
  await expect(dialogo.getByText('Rossi, Luca')).toBeVisible()
  await expect(dialogo.getByRole('button', { name: 'Cambiar' })).toHaveCount(0)
  await page.screenshot({ path: captura('13-turno-nuevo') })
  await dialogo.getByRole('button', { name: 'Crear turno' }).click()

  const proximos = page.getByRole('region', { name: 'Próximos turnos' })
  await expect(proximos.getByText('10:00')).toBeVisible()
  await expect(proximos.getByText(/Dr\. Juan Paz/)).toBeVisible()
  await expect(proximos.getByText('Pendiente')).toBeVisible()
})

test('el sistema no deja crear un turno que se pisa con otro del mismo profesional', async () => {
  const dialogo = await nuevoTurno(page, manana(10, 15))
  await dialogo.getByRole('button', { name: 'Crear turno' }).click()
  await expect(dialogo.getByText('El profesional ya tiene un turno en ese horario')).toBeVisible()
  await page.screenshot({ path: captura('14-turno-choque') })
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
})

test('reprograma el turno, lo confirma y lo cancela con motivo', async () => {
  const proximos = page.getByRole('region', { name: 'Próximos turnos' })

  await proximos.getByRole('button', { name: /10:00/ }).click()
  await page.getByRole('button', { name: 'Editar o reprogramar' }).click()
  await elegirHorario(page.getByRole('dialog'), manana(11))
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(proximos.getByText('11:00')).toBeVisible()
  await expect(proximos.getByText('10:00')).toHaveCount(0)

  await proximos.getByRole('button', { name: /11:00/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar' }).click()
  await expect(proximos.getByText('Confirmado')).toBeVisible()
  await page.screenshot({ path: captura('15-turno-confirmado') })

  await proximos.getByRole('button', { name: /11:00/ }).click()
  await page.getByRole('button', { name: 'Cancelar turno' }).click()
  await page.getByLabel('Motivo de la cancelación').fill('El paciente viaja')
  await page.getByRole('button', { name: 'Cancelar el turno' }).click()

  await expect(page.getByText('No tiene turnos próximos.')).toBeVisible()
  const historial = page.getByRole('region', { name: 'Historial' })
  await expect(historial.getByText('Cancelado')).toBeVisible()
})

test('un turno cancelado libera el horario', async () => {
  const dialogo = await nuevoTurno(page, manana(11))
  await dialogo.getByRole('button', { name: 'Crear turno' }).click()
  await expect(page.getByRole('region', { name: 'Próximos turnos' }).getByText('11:00')).toBeVisible()
})

test('la agenda muestra el calendario y los turnos de hoy aparecen en el inicio', async () => {
  const admin = await apiLogin(ADMIN_USERNAME, ADMIN_PASSWORD)
  const profesionales = (await (await admin.get('/api/professionals')).json()) as { id: string; displayName: string }[]
  const sedes = (await (await admin.get('/api/branches')).json()) as { id: string }[]
  const pacientes = (await (await admin.get('/api/patients?q=rossi')).json()) as { items: { id: string }[] }
  const hoy = new Date()
  hoy.setHours(0, 5, 0, 0)
  const creado = await admin.post('/api/appointments', {
    patientId: pacientes.items[0]?.id,
    professionalId: profesionales.find((p) => p.displayName === ODONTOLOGO.displayName)?.id,
    branchId: sedes[0]?.id,
    startsAt: hoy.toISOString(),
    endsAt: new Date(hoy.getTime() + 30 * 60_000).toISOString(),
  })
  expect(creado.status()).toBe(201)
  await admin.dispose()

  await page.goto('/agenda')
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hoy' })).toBeVisible()
  await page.screenshot({ path: captura('16-agenda'), fullPage: true })

  await page.goto('/dashboard')
  const hoyLista = page.getByRole('region', { name: 'Turnos de hoy' })
  await expect(hoyLista.getByText('Rossi, Luca')).toBeVisible()
  await page.screenshot({ path: captura('17-inicio-turnos-hoy'), fullPage: true })
})

test('desde el inicio se puede abrir un turno de hoy para reprogramarlo', async () => {
  await page.goto('/dashboard')
  await page.getByRole('region', { name: 'Turnos de hoy' }).getByText('Rossi, Luca').click()
  await page.getByRole('button', { name: 'Editar o reprogramar' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Editar o reprogramar turno' })
  await expect(dialogo.getByLabel('Hora', { exact: true })).toHaveValue('00:05')
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
})

test('marcar atendido antes de hora advierte pero deja confirmarlo', async () => {
  await abrirTurnosDeRossi(page)
  await page.getByRole('region', { name: 'Próximos turnos' }).getByRole('button', { name: /11:00/ }).click()
  await page.getByRole('button', { name: 'Marcar atendido' }).click()
  await expect(page.getByText(/El turno todavía no empezó/)).toBeVisible()
  await page.screenshot({ path: captura('17b-atendido-antes-de-hora') })
  await page.getByRole('button', { name: 'Marcar atendido igual' }).click()
  await expect(page.getByRole('region', { name: 'Historial' }).getByText('Atendido')).toBeVisible()
})

test('archivar un paciente con turnos pendientes pide confirmarlo y los cancela', async () => {
  const admin = await apiLogin(ADMIN_USERNAME, ADMIN_PASSWORD)
  const profesionales = (await (await admin.get('/api/professionals')).json()) as { id: string; displayName: string }[]
  const sedes = (await (await admin.get('/api/branches')).json()) as { id: string }[]
  const paciente = (await (await admin.post('/api/patients', { firstName: 'Lara', lastName: 'Díaz', documentNumber: '35111222' })).json()) as { id: string }
  const inicio = manana(15)
  const turno = await admin.post('/api/appointments', {
    patientId: paciente.id,
    professionalId: profesionales.find((p) => p.displayName === ODONTOLOGO.displayName)?.id,
    branchId: sedes[0]?.id,
    startsAt: inicio.toISOString(),
    endsAt: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
  })
  expect(turno.status()).toBe(201)
  await admin.dispose()

  await page.goto(`/patients/${paciente.id}`)
  await page.getByRole('button', { name: 'Archivar' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByRole('button', { name: 'Archivar' }).click()
  await expect(dialogo.getByText('El paciente tiene un turno pendiente:')).toBeVisible()
  const confirmar = dialogo.getByRole('button', { name: 'Archivar y cancelar turnos' })
  await expect(confirmar).toBeDisabled()
  await dialogo.getByRole('checkbox').check()
  await page.screenshot({ path: captura('17c-archivar-con-turnos') })
  await confirmar.click()

  await expect(page).toHaveURL(new RegExp(`/patients/${paciente.id}$`))
  await expect(page.getByText('Archivado').first()).toBeVisible()
  await page.getByRole('tab', { name: 'Turnos' }).click()
  await expect(page.getByRole('region', { name: 'Historial' }).getByText('Cancelado')).toBeVisible()
})
