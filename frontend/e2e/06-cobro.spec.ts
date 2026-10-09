import { expect, test, type Locator, type Page } from '@playwright/test'
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

const figura = (resumen: Locator, etiqueta: string) =>
  resumen.locator('div').filter({ has: resumen.page().getByText(etiqueta, { exact: true }) }).last()

async function abrirFichaDeRossi(page: Page) {
  await page.goto('/patients')
  await page.getByLabel('Buscar paciente').fill('rossi')
  await page.getByRole('link', { name: 'Rossi, Luca' }).click()
}

test('el odontólogo registra una prestación sin ver importes', async ({ page }) => {
  await ingresar(page, ODONTOLOGO)
  await abrirFichaDeRossi(page)
  await expect(page.getByRole('tab', { name: 'Cuenta' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Prestaciones' }).click()
  await expect(page.getByText('Todavía no tiene prestaciones registradas')).toBeVisible()
  await page.getByRole('button', { name: 'Registrar prestación' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Práctica realizada').selectOption({ label: 'Consulta' })
  await expect(dialogo.getByLabel('Precio')).toHaveCount(0)
  await dialogo.getByRole('button', { name: 'Registrar' }).click()

  const lista = page.getByRole('region', { name: 'Prestaciones realizadas' })
  await expect(lista.getByText('Consulta', { exact: true })).toBeVisible()
  await expect(lista.getByText(ODONTOLOGO.displayName, { exact: false })).toBeVisible()
  await expect(lista.getByText('$')).toHaveCount(0)
  await page.screenshot({ path: captura('20-prestacion-odontologo'), fullPage: true })
})

test('recepción ajusta el precio y cobra con dos medios de pago', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await expect(page.getByRole('region', { name: 'Saldos pendientes' }).getByText('Rossi, Luca')).toBeVisible()
  await page.screenshot({ path: captura('21-saldos-pendientes'), fullPage: true })

  await abrirFichaDeRossi(page)
  await page.getByRole('tab', { name: 'Prestaciones' }).click()
  const lista = page.getByRole('region', { name: 'Prestaciones realizadas' })
  await expect(lista.getByText('Consulta · $ 10.000,00')).toBeVisible()
  await lista.getByRole('button', { name: 'Ajustar precio' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '-10 %' }).click()
  await expect(page.getByRole('dialog').getByLabel('Precio')).toHaveValue('9000.00')
  await expect(page.getByRole('dialog').getByRole('button', { name: '-10 %' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Catálogo' })).toHaveAttribute('aria-pressed', 'false')
  await page.screenshot({ path: captura('22-ajustar-precio') })
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar precio' }).click()
  await expect(lista.getByText('Consulta · $ 9.000,00')).toBeVisible()
  await expect(lista.getByText('Precio de catálogo: $ 10.000,00')).toBeVisible()

  await page.getByRole('tab', { name: 'Cuenta' }).click()
  const resumen = page.getByRole('region', { name: 'Resumen de cuenta' })
  await expect(resumen.getByText('$ 9.000,00').first()).toBeVisible()

  await page.getByRole('button', { name: 'Registrar pago' }).click()
  const cobro = page.getByRole('dialog')
  await cobro.getByLabel('Importe').fill('3000')
  await cobro.getByRole('button', { name: 'Agregar otro medio de pago' }).click()
  await cobro.getByLabel('Importe').nth(1).fill('1000,50')
  await cobro.getByLabel('Medio de pago', { exact: true }).nth(1).selectOption({ label: 'Mercado Pago' })
  await cobro.getByLabel('Referencia (opcional)').fill('MP-0001')
  await expect(cobro.getByText('Total del cobro: $ 4.000,50')).toBeVisible()
  await page.screenshot({ path: captura('23-registrar-pago') })
  await cobro.getByRole('button', { name: 'Registrar pago' }).click()

  await expect(resumen.getByText('Saldo a cobrar')).toBeVisible()
  await expect(resumen.getByText('$ 4.999,50')).toBeVisible()
  const pagos = page.getByRole('region', { name: 'Pagos', exact: true })
  await expect(pagos.getByText('$ 3.000,00 · Efectivo')).toBeVisible()
  await expect(pagos.getByText('$ 1.000,50 · Mercado Pago · MP-0001')).toBeVisible()
  await expect(pagos.getByRole('button', { name: 'Anular' })).toHaveCount(2)
  await page.screenshot({ path: captura('24-cuenta-saldo'), fullPage: true })
})

test('un pago de más queda a favor y se usa para cobrar la prestación siguiente', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await abrirFichaDeRossi(page)
  await page.getByRole('tab', { name: 'Cuenta' }).click()
  const resumen = page.getByRole('region', { name: 'Resumen de cuenta' })
  await page.getByRole('button', { name: 'Registrar pago' }).click()
  await page.getByRole('dialog').getByLabel('Importe').fill('6000')
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar pago' }).click()
  await expect(figura(resumen, 'Saldo a cobrar')).toContainText('$ 0,00')
  await expect(figura(resumen, 'Saldo a favor')).toContainText('$ 1.000,50')

  await page.getByRole('tab', { name: 'Prestaciones' }).click()
  await page.getByRole('button', { name: 'Registrar prestación' }).click()
  const alta = page.getByRole('dialog')
  await alta.getByLabel('Práctica realizada').selectOption({ label: 'Consulta' })
  await alta.getByLabel('Profesional que la realizó').selectOption({ label: ODONTOLOGO.displayName })
  await alta.getByRole('button', { name: 'Registrar' }).click()

  await page.getByRole('tab', { name: 'Cuenta' }).click()
  await expect(figura(resumen, 'Saldo a cobrar')).toContainText('$ 10.000,00')
  await expect(figura(resumen, 'Saldo a favor')).toContainText('$ 1.000,50')
  await page.getByRole('button', { name: 'Registrar pago' }).click()
  const cobro = page.getByRole('dialog')
  await cobro.getByLabel('Importe').fill('1000,50')
  await cobro.getByLabel('Medio de pago', { exact: true }).selectOption({ label: 'Saldo a favor (disponible $ 1.000,50)' })
  await cobro.getByRole('button', { name: 'Agregar otro medio de pago' }).click()
  await cobro.getByLabel('Importe').nth(1).fill('8999,50')
  await cobro.getByLabel('Medio de pago', { exact: true }).nth(1).selectOption({ label: 'Efectivo' })
  await page.screenshot({ path: captura('25-cobro-con-saldo-a-favor') })
  await cobro.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(figura(resumen, 'Saldo a cobrar')).toContainText('$ 0,00')
  await expect(figura(resumen, 'Saldo a favor')).toContainText('$ 0,00')
  await expect(page.getByRole('region', { name: 'Pagos', exact: true }).getByText('$ 1.000,50 · Saldo a favor')).toBeVisible()
})

test('administración anula un pago con motivo y el saldo vuelve a subir', async ({ page }) => {
  await ingresar(page, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
  await abrirFichaDeRossi(page)
  await page.getByRole('tab', { name: 'Cuenta' }).click()
  const pagos = page.getByRole('region', { name: 'Pagos', exact: true })
  await pagos.getByRole('listitem').filter({ hasText: '$ 3.000,00 · Efectivo' }).getByRole('button', { name: 'Anular' }).click()
  await page.getByLabel('Motivo').fill('Importe cargado dos veces')
  await page.getByRole('dialog').getByRole('button', { name: 'Anular', exact: true }).click()

  await expect(pagos.getByText('Anulado')).toBeVisible()
  await expect(pagos.getByText('Motivo de la anulación: Importe cargado dos veces')).toBeVisible()
  await expect(figura(page.getByRole('region', { name: 'Resumen de cuenta' }), 'Saldo a cobrar')).toContainText('$ 3.000,00')
  await page.screenshot({ path: captura('26-pago-anulado'), fullPage: true })
})

test('los pagos se muestran de a 10 por página', async ({ page }) => {
  const recepcion = await apiLogin(RECEPCION.username, RECEPCION.password)
  const pacientes = (await (await recepcion.get('/api/patients?q=rossi')).json()) as { items: { id: string }[] }
  const id = pacientes.items[0]?.id ?? ''
  for (let i = 0; i < 6; i += 1) {
    const res = await recepcion.post(`/api/patients/${id}/payments`, { lines: [{ amount: '100', method: 'CASH' }] })
    expect(res.status()).toBe(201)
  }
  await recepcion.dispose()

  await ingresar(page, RECEPCION)
  await abrirFichaDeRossi(page)
  await page.getByRole('tab', { name: 'Cuenta' }).click()
  const pagos = page.getByRole('region', { name: 'Pagos', exact: true })
  await expect(pagos.getByRole('listitem')).toHaveCount(10)
  const paginacion = page.getByRole('navigation', { name: 'Paginación de pagos' })
  await expect(paginacion.getByText('Página 1 de 2')).toBeVisible()
  await paginacion.getByRole('button', { name: 'Siguiente' }).click()
  await expect(paginacion.getByText('Página 2 de 2')).toBeVisible()
  await expect(pagos.getByRole('listitem')).toHaveCount(1)
})
