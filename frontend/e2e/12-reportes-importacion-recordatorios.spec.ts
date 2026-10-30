import { expect, test, type Page } from '@playwright/test'
import { ADMIN_PASSWORD, ADMIN_USERNAME, apiLogin, ODONTOLOGO, RECEPCION } from './api'

test.describe.configure({ mode: 'serial' })

const captura = (nombre: string) => `test-results/screens/${nombre}.png`

async function ingresar(page: Page, usuario: { username: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(usuario.username)
  await page.getByLabel('Contraseña').fill(usuario.password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

test('los accesos rápidos cargan un paciente nuevo y abren su ficha', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await page.getByRole('button', { name: 'Nuevo paciente' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Nombre').fill('Rocío')
  await dialogo.getByLabel('Apellido').fill('Acosta')
  await dialogo.getByLabel('Número de documento').fill('40111222')
  await dialogo.getByLabel('Fecha de nacimiento').fill('03041991')
  await dialogo.getByRole('button', { name: /Crear|Guardar/ }).click()
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]+$/)
  await expect(page.getByRole('heading', { name: /Acosta, Rocío/ })).toBeVisible()
})

test('recepción importa pacientes desde un CSV con vista previa', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await page.goto('/patients')
  await page.getByRole('link', { name: 'Importar CSV' }).click()
  const csv = [
    'nombre;apellido;tipo_documento;documento;fecha_nacimiento;telefono;email;direccion',
    'Irene;Quiroga;DNI;41222333;12/04/1992;11 6000-2222;;',
    'Sin;Documento;DNI;;12/04/1992;;;',
  ].join('\n')
  await page.getByLabel('Archivo CSV de pacientes').setInputFiles({ name: 'pacientes.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  const vista = page.getByRole('region', { name: 'Vista previa' })
  await expect(vista.getByText('Ingresá el número de documento')).toBeVisible()
  await page.screenshot({ path: captura('51-importacion-vista-previa'), fullPage: true })
  await page.getByRole('button', { name: 'Importar 1 pacientes' }).click()
  await expect(page.getByText('Se cargaron 1 pacientes.')).toBeVisible()
  await page.goto('/patients')
  await page.getByLabel('Buscar paciente').fill('quiroga')
  await expect(page.getByRole('link', { name: 'Quiroga, Irene' })).toBeVisible()
})

test('recordatorios: se generan, abren WhatsApp y registran la confirmación', async ({ page }) => {
  const admin = await apiLogin(ADMIN_USERNAME, ADMIN_PASSWORD)
  const profesionales = (await (await admin.get('/api/professionals')).json()) as { id: string; displayName: string }[]
  const sedes = (await (await admin.get('/api/branches')).json()) as { id: string }[]
  const pacientes = (await (await admin.get('/api/patients?q=quiroga')).json()) as { items: { id: string }[] }
  const inicio = new Date()
  inicio.setDate(inicio.getDate() + 1)
  inicio.setHours(8, 30, 0, 0)
  const turno = await admin.post('/api/appointments', {
    patientId: pacientes.items[0]?.id,
    professionalId: profesionales.find((p) => p.displayName === ODONTOLOGO.displayName)?.id,
    branchId: sedes[0]?.id,
    startsAt: inicio.toISOString(),
    endsAt: new Date(inicio.getTime() + 30 * 60_000).toISOString(),
    acknowledgeWarnings: true,
  })
  expect(turno.status()).toBe(201)
  await admin.dispose()

  await ingresar(page, RECEPCION)
  await page.goto('/reminders')
  await page.getByRole('button', { name: 'Generar los que faltan' }).click()
  const fila = page.getByRole('listitem').filter({ hasText: 'Quiroga, Irene' })
  await expect(fila.getByRole('link', { name: 'Enviar por WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/5491160002222\?text=Hola%20Irene/)
  await page.screenshot({ path: captura('52-recordatorios'), fullPage: true })
  await fila.getByRole('button', { name: 'Confirmó' }).click()
  await expect(fila.getByText('Confirmó', { exact: true })).toBeVisible()
})

test('reportes del período con exportación', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await page.goto('/reports')
  await expect(page.getByRole('cell', { name: 'Total' })).toBeVisible()
  await page.getByRole('tab', { name: 'Cobranzas' }).click()
  await expect(page.getByText(/Total cobrado en el período/)).toBeVisible()
  await page.getByRole('tab', { name: 'Saldos pendientes' }).click()
  const descarga = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar CSV' }).first().click()
  expect((await descarga).suggestedFilename()).toBe('reporte-saldos.csv')
  await page.screenshot({ path: captura('53-reportes'), fullPage: true })
})

test('en el celular el menú se abre con un botón', async ({ browser }) => {
  const movil = await browser.newPage({ viewport: { width: 375, height: 812 } })
  await ingresar(movil, RECEPCION)
  await expect(movil.getByRole('navigation', { name: 'Principal (móvil)' })).toHaveCount(0)
  await movil.getByRole('button', { name: 'Abrir el menú' }).click()
  await movil.getByRole('navigation', { name: 'Principal (móvil)' }).getByRole('link', { name: 'Pacientes' }).click()
  await expect(movil).toHaveURL(/\/patients$/)
  await expect(movil.getByRole('navigation', { name: 'Principal (móvil)' })).toHaveCount(0)
  await movil.screenshot({ path: captura('54-celular'), fullPage: true })
  await movil.getByRole('link', { name: 'Rossi, Luca' }).click()
  await expect(movil.getByRole('heading', { name: /Rossi, Luca/ })).toBeVisible()
  await movil.screenshot({ path: captura('55-celular-ficha'), fullPage: true })
  await movil.goto('/dashboard')
  await expect(movil.getByRole('heading', { name: /Hola/ })).toBeVisible()
  await movil.screenshot({ path: captura('56-celular-inicio'), fullPage: true })
  await movil.close()
})
