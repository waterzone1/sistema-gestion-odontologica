import { expect, test, type Page } from '@playwright/test'
import { ODONTOLOGO, RECEPCION } from './api'

test.describe.configure({ mode: 'serial' })

const captura = (nombre: string) => `test-results/screens/${nombre}.png`

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

test('el odontólogo arma un plan con una práctica sobre una pieza, sin ver importes', async ({ page }) => {
  await ingresar(page, ODONTOLOGO)
  await abrirFichaDeRossi(page, 'Tratamiento')
  await page.getByLabel('Nuevo plan de tratamiento').fill('Rehabilitación')
  await page.getByRole('button', { name: 'Crear plan' }).click()
  const plan = page.getByRole('region', { name: 'Rehabilitación' })
  await plan.getByRole('button', { name: 'Agregar práctica' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Práctica').selectOption({ label: 'Consulta' })
  await dialogo.getByLabel('Pieza (opcional)').selectOption('46')
  await dialogo.getByRole('button', { name: 'O', exact: true }).click()
  await dialogo.getByRole('button', { name: 'Agregar' }).click()
  await expect(plan.getByText('Pieza 46 (O)')).toBeVisible()
  await expect(plan.getByText('$')).toHaveCount(0)
  await expect(plan.getByText('Presupuesto sin aceptar')).toBeVisible()
  await page.screenshot({ path: captura('36-plan-odontologo'), fullPage: true })
})

test('recepción cotiza con descuento y registra la aceptación, sin ver piezas', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await abrirFichaDeRossi(page, 'Tratamiento')
  const plan = page.getByRole('region', { name: 'Rehabilitación' })
  await expect(plan.getByText('Pieza 46')).toHaveCount(0)
  await expect(plan.getByText(/Sin cotizar/)).toBeVisible()
  await plan.getByRole('button', { name: 'Cotizar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '-10 %' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar precio' }).click()
  await expect(plan.getByText(/Acordado \$\s9\.000,00/)).toBeVisible()
  await plan.getByRole('button', { name: 'Registrar aceptación del presupuesto' }).click()
  await expect(plan.getByText('Presupuesto aceptado')).toBeVisible()
  await expect(plan.getByText('Total $ 9.000,00')).toBeVisible()
  await page.screenshot({ path: captura('37-plan-recepcion'), fullPage: true })
})

test('el odontólogo registra el ítem como realizado y se ve en el odontograma', async ({ page }) => {
  await ingresar(page, ODONTOLOGO)
  await abrirFichaDeRossi(page, 'Tratamiento')
  const plan = page.getByRole('region', { name: 'Rehabilitación' })
  await plan.getByRole('button', { name: 'Registrar realizado' }).click()
  await expect(plan.getByText('Terminado')).toBeVisible()
  await page.getByRole('tab', { name: 'Odontograma' }).click()
  await page.getByRole('button', { name: /^Pieza 46/ }).click()
  const panel = page.getByRole('complementary', { name: 'Pieza 46' })
  await expect(panel.getByText('Realizado')).toBeVisible()
  await expect(panel.getByText('Consulta (O)')).toBeVisible()
})

test('recepción ve la prestación del plan con el precio acordado', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await abrirFichaDeRossi(page, 'Prestaciones')
  const lista = page.getByRole('region', { name: 'Prestaciones realizadas' })
  const delPlan = lista.getByRole('listitem').filter({ hasText: 'Del plan de tratamiento' })
  await expect(delPlan.getByText('Consulta · $ 9.000,00')).toBeVisible()
})

test('desde un turno atendido se registra la prestación', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await abrirFichaDeRossi(page, 'Turnos')
  const historial = page.getByRole('region', { name: 'Historial' })
  await historial.getByRole('button', { name: /Atendido/ }).first().click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByRole('button', { name: 'Registrar prestación' }).click()
  await expect(dialogo.getByLabel('Qué se realizó')).toHaveValue(/practice:/)
  await page.screenshot({ path: captura('38-prestacion-desde-turno') })
  await dialogo.getByRole('button', { name: 'Registrar prestación' }).click()
  await expect(dialogo.getByText('Prestación registrada.')).toBeVisible()
})
