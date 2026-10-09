import { expect, test, type Page } from '@playwright/test'
import { apiLogin, ODONTOLOGO, RECEPCION } from './api'

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

test('el odontólogo registra una nota y le agrega una corrección', async ({ page }) => {
  await ingresar(page, ODONTOLOGO)
  await abrirFichaDeRossi(page)
  await page.getByRole('tab', { name: 'Historia clínica' }).click()
  await expect(page.getByText('Todavía no hay notas clínicas')).toBeVisible()

  await page.getByLabel('Nueva nota de evolución').fill('Caries oclusal en pieza 16. Se indica restauración.')
  await page.getByRole('button', { name: 'Guardar nota' }).click()

  const notas = page.getByRole('region', { name: 'Notas clínicas' })
  await expect(notas.getByText('Caries oclusal en pieza 16.')).toBeVisible()
  await expect(notas.getByText(ODONTOLOGO.displayName)).toBeVisible()
  await page.screenshot({ path: captura('18-historia-nota'), fullPage: true })

  await notas.getByRole('button', { name: 'Agregar corrección' }).click()
  await page.getByLabel('Corrección', { exact: true }).fill('La pieza correcta es la 26.')
  await page.getByRole('button', { name: 'Guardar corrección' }).click()
  await expect(notas.getByText('La pieza correcta es la 26.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Guardar corrección' })).toHaveCount(0)
  await expect(notas.getByText('Corrección', { exact: true })).toBeVisible()
  await expect(notas.getByText('Caries oclusal en pieza 16.')).toBeVisible()
  await page.screenshot({ path: captura('19-historia-correccion'), fullPage: true })

  await page.reload()
  await page.getByRole('tab', { name: 'Historia clínica' }).click()
  await expect(page.getByText('La pieza correcta es la 26.')).toBeVisible()
})

test('recepción no ve la historia clínica ni por pantalla ni por API', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await abrirFichaDeRossi(page)
  await expect(page.getByRole('tab', { name: 'Resumen' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Historia clínica' })).toHaveCount(0)

  const sesion = await apiLogin(RECEPCION.username, RECEPCION.password)
  const odontologo = await apiLogin(ODONTOLOGO.username, ODONTOLOGO.password)
  const pacientes = (await (await odontologo.get('/api/patients?q=rossi')).json()) as { items: { id: string }[] }
  const id = pacientes.items[0]?.id
  expect((await sesion.get(`/api/patients/${id}/clinical`)).status()).toBe(403)
  expect((await sesion.post(`/api/patients/${id}/clinical`, { content: 'Intento de escritura' })).status()).toBe(403)
  await sesion.dispose()
  await odontologo.dispose()
})
