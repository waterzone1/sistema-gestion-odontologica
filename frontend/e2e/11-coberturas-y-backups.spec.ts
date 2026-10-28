import { expect, test, type Page } from '@playwright/test'
import { ADMIN_PASSWORD, ADMIN_USERNAME, apiLogin, ODONTOLOGO, RECEPCION } from './api'

test.describe.configure({ mode: 'serial' })

const captura = (nombre: string) => `test-results/screens/${nombre}.png`
const ADMIN = { username: ADMIN_USERNAME, password: ADMIN_PASSWORD }

async function ingresar(page: Page, usuario: { username: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(usuario.username)
  await page.getByLabel('Contraseña').fill(usuario.password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function abrirFichaDeRossi(page: Page, pestania: string) {
  await page.goto('/patients')
  await page.getByLabel('Buscar paciente').fill('rossi')
  await page.getByRole('link', { name: 'Rossi, Luca' }).click()
  await page.getByRole('tab', { name: pestania }).click()
}

test('el administrador activa el módulo de coberturas y liquidaciones', async ({ page }) => {
  await ingresar(page, ADMIN)
  await expect(page.getByRole('link', { name: 'Coberturas' })).toHaveCount(0)
  await page.goto('/settings')
  await page.getByLabel('Coberturas y liquidaciones').click()
  await expect(page.getByLabel('Coberturas y liquidaciones')).toBeChecked()
  await expect(page.getByRole('link', { name: 'Coberturas' }).first()).toBeVisible()
  await page.getByRole('region', { name: 'Consultorio: módulos' }).screenshot({ path: captura('44b-modulo-coberturas') })
})

test('recepción carga una prepaga con plan y convenio', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await page.goto('/coverages')
  await page.getByRole('button', { name: 'Nueva cobertura' }).click()
  const alta = page.getByRole('dialog')
  await alta.getByLabel('Nombre').fill('OSDE')
  await alta.getByLabel('Tipo').selectOption({ label: 'Prepaga' })
  await alta.getByRole('button', { name: 'Crear' }).click()

  const osde = page.getByRole('region', { name: 'OSDE' })
  await osde.getByLabel('Nuevo plan de OSDE').fill('210')
  await osde.getByRole('button', { name: 'Agregar plan' }).click()
  await osde.getByRole('button', { name: 'Plan 210' }).click()

  await page.getByRole('button', { name: 'Nuevo convenio' }).click()
  const convenio = page.getByRole('dialog')
  await convenio.getByLabel('Práctica', { exact: true }).selectOption({ label: 'Consulta' })
  await convenio.getByLabel('Cubre').fill('7000')
  await convenio.getByLabel('Coseguro').fill('3000')
  await convenio.getByRole('button', { name: 'Guardar convenio' }).click()
  const convenios = page.getByRole('region', { name: 'Convenios de OSDE · 210' })
  await expect(convenios.getByRole('cell', { name: /\$\s7\.000,00/ })).toBeVisible()
  await page.screenshot({ path: captura('45-coberturas-y-convenios'), fullPage: true })
})

test('al paciente con cobertura se le cobra solo el coseguro', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await abrirFichaDeRossi(page, 'Resumen')
  const cobertura = page.getByRole('region', { name: 'Cobertura' })
  await cobertura.getByRole('button', { name: 'Asignar' }).click()
  await cobertura.getByLabel('Obra social o prepaga').selectOption({ label: 'OSDE' })
  await cobertura.getByLabel('Plan').selectOption({ label: '210' })
  await cobertura.getByLabel('Número de afiliado').fill('61-000123-4')
  await cobertura.getByRole('button', { name: 'Guardar cobertura' }).click()
  await expect(cobertura.getByText('OSDE · 210')).toBeVisible()

  await page.getByRole('tab', { name: 'Prestaciones' }).click()
  await page.getByRole('button', { name: 'Registrar prestación' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Práctica realizada').selectOption({ label: 'Consulta' })
  await dialogo.getByLabel('Profesional que la realizó').selectOption({ label: ODONTOLOGO.displayName })
  await expect(dialogo.getByText(/Cubre \$\s7\.000,00 · Paga el paciente \$\s3\.000,00/)).toBeVisible()
  await expect(dialogo.getByLabel('A cargo del paciente')).toHaveValue('3000.00')
  await page.screenshot({ path: captura('46-prestacion-con-cobertura') })
  await dialogo.getByRole('button', { name: 'Registrar' }).click()
  const lista = page.getByRole('region', { name: 'Prestaciones realizadas' })
  await expect(lista.getByText(/A cargo de la cobertura \$\s7\.000,00/).first()).toBeVisible()
})

test('recepción liquida a la cobertura, registra el resultado y el pago', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await page.goto('/liquidations')
  await page.getByRole('button', { name: 'Nueva liquidación' }).click()
  const alta = page.getByRole('dialog')
  await alta.getByLabel('Cobertura').selectOption({ label: 'OSDE' })
  await alta.getByRole('button', { name: 'Armar liquidación' }).click()
  await expect(page).toHaveURL(/\/liquidations\/[0-9a-f-]+$/)
  const totales = page.getByRole('region', { name: 'Totales' })
  await expect(totales.getByText(/\$\s7\.000,00/).first()).toBeVisible()

  await page.getByRole('button', { name: 'Marcar como presentada' }).click()
  await page.getByRole('button', { name: 'Débito' }).click()
  const debito = page.getByRole('dialog')
  await debito.getByLabel('Lo que aprobó la cobertura').fill('6000')
  await debito.getByLabel('Motivo del débito').fill('Falta firma del paciente')
  await debito.getByRole('button', { name: 'Registrar débito' }).click()
  await expect(page.getByText('Falta firma del paciente')).toBeVisible()
  await page.getByRole('button', { name: 'Registrar pago' }).click()
  await page.getByRole('dialog').getByLabel('Referencia (opcional)').fill('TR-0001')
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar pago' }).click()
  await expect(page.getByText('Pagada', { exact: true })).toBeVisible()
  await page.screenshot({ path: captura('47-liquidacion-pagada'), fullPage: true })
  await expect(page.getByRole('link', { name: 'Exportar CSV' })).toHaveAttribute('href', /\/export$/)
})

test('administración ve la auditoría y recepción no', async ({ page }) => {
  await ingresar(page, ADMIN)
  await page.goto('/admin/audit')
  await page.getByLabel('Acción').selectOption({ label: 'Liquidación pagada' })
  await page.getByRole('button', { name: 'Filtrar' }).click()
  const evento = page.getByRole('listitem').filter({ hasText: 'Liquidación pagada' }).first()
  await expect(evento).toBeVisible()
  await expect(evento.getByText(new RegExp(RECEPCION.displayName))).toBeVisible()
  await page.screenshot({ path: captura('48-auditoria'), fullPage: true })

  const recepcion = await apiLogin(RECEPCION.username, RECEPCION.password)
  expect((await recepcion.get('/api/audit')).status()).toBe(403)
  await recepcion.dispose()
})

test('un backup se restaura de verdad: lo cargado después desaparece', async ({ page }) => {
  test.setTimeout(120_000)
  await ingresar(page, ADMIN)
  await page.goto('/admin/backups')
  await page.getByRole('button', { name: 'Generar backup ahora' }).click()
  const fila = page.getByRole('listitem').filter({ hasText: 'Manual' }).first()
  await expect(fila.getByText('Completo')).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: captura('49-backups'), fullPage: true })

  const admin = await apiLogin(ADMIN_USERNAME, ADMIN_PASSWORD)
  const nuevo = await admin.post('/api/patients', {
    firstName: 'Cargada',
    lastName: 'Después Del Backup',
    documentNumber: '39888777',
    birthDate: '1995-01-01',
  })
  expect(nuevo.status()).toBe(201)
  const despues = (await (await admin.get('/api/patients?q=cargada')).json()) as { total: number }
  expect(despues.total).toBe(1)

  await page.reload()
  await page.getByRole('listitem').filter({ hasText: 'Manual' }).first().getByRole('button', { name: 'Restaurar' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Escribí RESTAURAR para confirmar').fill('RESTAURAR')
  await dialogo.getByRole('button', { name: 'Restaurar' }).click()
  await expect(page.getByText(/Restauración terminada y verificada/)).toBeVisible({ timeout: 60_000 })
  await page.screenshot({ path: captura('50-restauracion'), fullPage: true })

  expect((await admin.get('/api/patients?q=cargada')).status()).toBe(401)
  await admin.dispose()
  const otraVez = await apiLogin(ADMIN_USERNAME, ADMIN_PASSWORD)
  const restaurado = (await (await otraVez.get('/api/patients?q=cargada')).json()) as { total: number }
  expect(restaurado.total).toBe(0)
  await otraVez.dispose()
  await page.goto('/admin/audit')
  await page.getByLabel('Acción').selectOption({ label: 'Restauración desde backup' })
  await page.getByRole('button', { name: 'Filtrar' }).click()
  await expect(page.getByRole('listitem').filter({ hasText: 'Restauración desde backup' }).first()).toBeVisible()
})
