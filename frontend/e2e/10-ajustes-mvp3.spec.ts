import { expect, test, type Page } from '@playwright/test'
import { ADMIN_PASSWORD, ADMIN_USERNAME, apiLogin, ODONTOLOGO, RECEPCION } from './api'

test.describe.configure({ mode: 'serial' })

const captura = (nombre: string) => `test-results/screens/${nombre}.png`

async function ingresar(page: Page, usuario: { username: string; password: string }, destino = /\/dashboard$/) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(usuario.username)
  await page.getByLabel('Contraseña').fill(usuario.password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(destino)
}

async function abrirFichaDeRossi(page: Page, pestania: string) {
  await page.goto('/patients')
  await page.getByLabel('Buscar paciente').fill('rossi')
  await page.getByRole('link', { name: 'Rossi, Luca' }).click()
  await page.getByRole('tab', { name: pestania }).click()
}

async function turnoDeRossi(enDias: number, hora: number, estado?: 'CANCELLED' | 'ATTENDED') {
  const admin = await apiLogin(ADMIN_USERNAME, ADMIN_PASSWORD)
  const profesionales = (await (await admin.get('/api/professionals')).json()) as { id: string; displayName: string }[]
  const sedes = (await (await admin.get('/api/branches')).json()) as { id: string }[]
  const pacientes = (await (await admin.get('/api/patients?q=rossi')).json()) as { items: { id: string }[] }
  const inicio = new Date()
  inicio.setDate(inicio.getDate() + enDias)
  inicio.setHours(hora, 0, 0, 0)
  const res = await admin.post('/api/appointments', {
    patientId: pacientes.items[0]?.id,
    professionalId: profesionales.find((p) => p.displayName === ODONTOLOGO.displayName)?.id,
    branchId: sedes[0]?.id,
    startsAt: inicio.toISOString(),
    endsAt: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
    acknowledgeWarnings: true,
  })
  expect(res.status()).toBe(201)
  const turno = (await res.json()) as { id: string }
  if (estado) {
    const body = estado === 'CANCELLED' ? { status: estado, cancellationReason: 'No puede venir' } : { status: estado }
    expect((await admin.post(`/api/appointments/${turno.id}/status`, body)).status()).toBe(200)
  }
  await admin.dispose()
}

test('recepción deja un mensaje sobre el paciente y el odontólogo lo ve en la ficha', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await abrirFichaDeRossi(page, 'Resumen')
  const mensajes = page.getByRole('region', { name: 'Mensajes del equipo' })
  await mensajes.getByLabel('Nuevo mensaje').fill('Trae los estudios la próxima visita')
  await mensajes.getByRole('button', { name: 'Enviar' }).click()
  await expect(mensajes.getByText('Trae los estudios la próxima visita')).toBeVisible()
  await expect(mensajes.getByText(new RegExp(RECEPCION.displayName))).toBeVisible()

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await ingresar(page, ODONTOLOGO)
  await abrirFichaDeRossi(page, 'Resumen')
  await expect(page.getByRole('region', { name: 'Mensajes del equipo' }).getByText('Trae los estudios la próxima visita')).toBeVisible()
  await page.screenshot({ path: captura('40-mensajes-del-equipo'), fullPage: true })
})

test('recepción carga la cotización y cobra en dólares; la caja lo muestra por moneda', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await page.goto('/settings')
  await page.getByLabel('Nueva cotización (pesos por dólar)').fill('1000')
  await page.getByRole('button', { name: 'Guardar cotización' }).click()
  await expect(page.getByText(/Vigente: \$\s1\.000,00 por dólar/)).toBeVisible()

  await abrirFichaDeRossi(page, 'Cuenta')
  await page.getByRole('button', { name: 'Registrar pago' }).click()
  const cobro = page.getByRole('dialog')
  await expect(cobro.getByText('Trae los estudios la próxima visita')).toBeVisible()
  await cobro.getByLabel('Importe').fill('5')
  await cobro.getByLabel('Moneda').selectOption({ label: 'Dólares' })
  await expect(cobro.getByText(/Equivale a \$\s5\.000,00/)).toBeVisible()
  await page.screenshot({ path: captura('41-cobro-en-dolares') })
  await cobro.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(page.getByRole('region', { name: 'Pagos', exact: true }).getByText(/US\$\s5,00 \(a \$\s1\.000,00\) = \$\s5\.000,00/)).toBeVisible()

  await page.goto('/cash')
  const totales = page.getByRole('region', { name: 'Totales del día' })
  await expect(totales.getByText(/US\$\s5,00/)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Por medio de pago' }).getByText('Efectivo en dólares')).toBeVisible()
  await page.screenshot({ path: captura('42-caja-del-dia'), fullPage: true })
})

test('un turno cancelado se reactiva desde la ficha', async ({ page }) => {
  await turnoDeRossi(3, 16, 'CANCELLED')
  await ingresar(page, RECEPCION)
  await abrirFichaDeRossi(page, 'Turnos')
  await page.getByRole('region', { name: 'Historial' }).getByRole('button', { name: /Cancelado/ }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reactivar turno' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Próximos turnos' }).getByText('Pendiente').first()).toBeVisible()
})

test('un turno atendido sin prestación se cierra sin cargo desde el inicio', async ({ page }) => {
  await turnoDeRossi(4, 10, 'ATTENDED')
  await ingresar(page, RECEPCION)
  const pendientes = page.getByRole('region', { name: /Pendientes de facturar/ })
  const filas = pendientes.getByRole('listitem').filter({ hasText: 'Rossi, Luca' }).filter({ hasText: 'Turno del' })
  await expect(filas.first()).toBeVisible()
  const antes = await filas.count()
  await filas.first().getByRole('button', { name: 'Cerrar turno' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByRole('button', { name: 'Sin cargo' }).click()
  await dialogo.getByLabel('Motivo').fill('Control posterior')
  await dialogo.getByRole('button', { name: 'Cerrar sin cargo' }).click()
  await expect(dialogo.getByText('Turno cerrado.')).toBeVisible()
  await expect(dialogo.getByText('Sin cargo: Control posterior')).toBeVisible()
  await page.screenshot({ path: captura('43-turno-cerrado-sin-cargo') })
  await page.keyboard.press('Escape')
  await expect(filas).toHaveCount(antes - 1)
})

test('el odontólogo ordena su menú y elige que la agenda se abra al entrar', async ({ page }) => {
  await ingresar(page, ODONTOLOGO)
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Subir Pacientes' }).click()
  await expect(page.getByRole('button', { name: 'Subir Pacientes' })).toBeEnabled()
  await page.getByLabel('Pantalla al entrar').selectOption({ label: 'Agenda' })
  await page.screenshot({ path: captura('44-configuracion'), fullPage: true })
  const menu = page.getByRole('navigation').first()
  const enlaces = await menu.getByRole('link').allTextContents()
  expect(enlaces.indexOf('Pacientes')).toBeLessThan(enlaces.indexOf('Agenda'))

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await ingresar(page, ODONTOLOGO, /\/agenda$/)
  const odontologo = await apiLogin(ODONTOLOGO.username, ODONTOLOGO.password)
  await odontologo.put('/api/auth/preferences', { preferences: { homePage: '/dashboard', menuOrder: [] } })
  await odontologo.dispose()
})
