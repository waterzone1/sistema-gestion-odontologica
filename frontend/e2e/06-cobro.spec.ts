import { expect, test, type Page } from '@playwright/test'
import { ADMIN_PASSWORD, ADMIN_USERNAME, ODONTOLOGO, RECEPCION } from './api'

test.describe.configure({ mode: 'serial' })

const captura = (nombre: string) => `test-results/screens/${nombre}.png`

async function ingresar(page: Page, usuario: { username: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Usuario').fill(usuario.username)
  await page.getByLabel('Contraseña').fill(usuario.password)
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

async function abrirFichaDeRossi(page: Page) {
  await page.goto('/patients')
  await page.getByLabel('Buscar paciente').fill('rossi')
  await page.getByRole('link', { name: 'Rossi, Luca' }).click()
}

test('el odontólogo registra una prestación y no ve la cuenta', async ({ page }) => {
  await ingresar(page, ODONTOLOGO)
  await abrirFichaDeRossi(page)
  await expect(page.getByRole('tab', { name: 'Cuenta' })).toHaveCount(0)

  await page.getByRole('tab', { name: 'Prestaciones' }).click()
  await expect(page.getByText('Todavía no tiene prestaciones registradas')).toBeVisible()
  await page.getByRole('button', { name: 'Registrar prestación' }).click()
  await page.getByLabel('Práctica realizada').selectOption({ label: 'Consulta — $ 10.000,00' })
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar' }).click()

  const lista = page.getByRole('region', { name: 'Prestaciones realizadas' })
  await expect(lista.getByText('Consulta · $ 10.000,00')).toBeVisible()
  await expect(lista.getByText('Pendiente $ 10.000,00')).toBeVisible()
  await page.screenshot({ path: captura('20-prestacion'), fullPage: true })
})

test('recepción cobra un pago parcial y el saldo se recalcula', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await expect(page.getByRole('region', { name: 'Saldos pendientes' }).getByText('Rossi, Luca')).toBeVisible()
  await page.screenshot({ path: captura('21-saldos-pendientes'), fullPage: true })

  await abrirFichaDeRossi(page)
  await page.getByRole('tab', { name: 'Cuenta' }).click()
  const resumen = page.getByRole('region', { name: 'Resumen de cuenta' })
  await expect(resumen.getByText('$ 10.000,00').first()).toBeVisible()

  await page.getByRole('button', { name: 'Registrar pago' }).click()
  await page.getByLabel('Importe').fill('4000')
  await page.getByLabel('Medio de pago').selectOption({ label: 'Mercado Pago' })
  await page.getByLabel('Referencia (opcional)').fill('MP-0001')
  await page.screenshot({ path: captura('22-registrar-pago') })
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar pago' }).click()

  await expect(resumen.getByText('Saldo a cobrar')).toBeVisible()
  await expect(resumen.getByText('$ 6.000,00')).toBeVisible()
  const pagos = page.getByRole('region', { name: 'Pagos', exact: true })
  await expect(pagos.getByText('$ 4.000,00 · Mercado Pago · MP-0001')).toBeVisible()
  await expect(pagos.getByRole('button', { name: 'Anular' })).toHaveCount(0)
  await page.screenshot({ path: captura('23-cuenta-saldo'), fullPage: true })
})

test('administración anula el pago con motivo y el saldo vuelve a subir', async ({ page }) => {
  await ingresar(page, { username: ADMIN_USERNAME, password: ADMIN_PASSWORD })
  await abrirFichaDeRossi(page)
  await page.getByRole('tab', { name: 'Cuenta' }).click()
  const pagos = page.getByRole('region', { name: 'Pagos', exact: true })
  await pagos.getByRole('button', { name: 'Anular' }).click()
  await page.getByLabel('Motivo').fill('Importe cargado dos veces')
  await page.getByRole('dialog').getByRole('button', { name: 'Anular pago' }).click()

  await expect(pagos.getByText('Anulado')).toBeVisible()
  await expect(pagos.getByText('Motivo de la anulación: Importe cargado dos veces')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Resumen de cuenta' }).getByText('$ 10.000,00').last()).toBeVisible()
  await page.screenshot({ path: captura('24-pago-anulado'), fullPage: true })
})
