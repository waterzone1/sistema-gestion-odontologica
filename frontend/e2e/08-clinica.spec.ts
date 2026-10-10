import { expect, test, type Page } from '@playwright/test'
import { apiLogin, ODONTOLOGO, RECEPCION } from './api'

test.describe.configure({ mode: 'serial' })

const captura = (nombre: string) => `test-results/screens/${nombre}.png`
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n%prueba\n'), Buffer.alloc(512, 0x20)])

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

test('el odontólogo completa el perfil clínico y la alerta aparece en la ficha', async ({ page }) => {
  await ingresar(page, ODONTOLOGO)
  await abrirFichaDeRossi(page)
  await page.getByRole('tab', { name: 'Historia clínica' }).click()
  const perfil = page.getByRole('region', { name: 'Perfil clínico' })
  await perfil.getByRole('button', { name: 'Completar' }).click()
  await perfil.getByLabel('Alertas').fill('Alérgico a la penicilina')
  await perfil.getByLabel('Alergias').fill('Penicilina')
  await perfil.getByLabel('Medicación').fill('Enalapril 10 mg')
  await perfil.getByRole('button', { name: 'Guardar perfil' }).click()
  await expect(perfil.getByText('Enalapril 10 mg')).toBeVisible()
  await expect(page.getByRole('note').filter({ hasText: 'Alérgico a la penicilina' })).toBeVisible()
  await page.screenshot({ path: captura('33-perfil-clinico'), fullPage: true })
})

test('el odontólogo sube un estudio en PDF, lo abre y lo archiva', async ({ page }) => {
  await ingresar(page, ODONTOLOGO)
  await abrirFichaDeRossi(page)
  await page.getByRole('tab', { name: 'Archivos' }).click()
  await page.getByRole('button', { name: 'Subir archivo' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Archivo').setInputFiles({ name: 'panoramica.pdf', mimeType: 'application/pdf', buffer: PDF })
  await dialogo.getByLabel('Categoría').selectOption({ label: 'Radiografía' })
  await dialogo.getByLabel('Descripción (opcional)').fill('Panorámica inicial')
  await dialogo.getByRole('button', { name: 'Subir' }).click()

  const lista = page.getByRole('region', { name: 'Archivos clínicos' })
  const enlace = lista.getByRole('link', { name: 'panoramica.pdf' })
  await expect(enlace).toBeVisible()
  await expect(lista.getByText('Panorámica inicial')).toBeVisible()
  await page.screenshot({ path: captura('34-archivos-clinicos'), fullPage: true })

  const href = await enlace.getAttribute('href')
  const respuesta = await page.request.get(href ?? '')
  expect(respuesta.status()).toBe(200)
  expect(respuesta.headers()['content-type']).toBe('application/pdf')

  await lista.getByRole('button', { name: 'Archivar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archivar' }).click()
  await expect(lista.getByRole('link', { name: 'panoramica.pdf' })).toHaveCount(0)
  await page.getByLabel('Mostrar archivados').check()
  await expect(lista.getByText('Archivado')).toBeVisible()
})

test('recepción no ve archivos ni perfil clínico, ni por pantalla ni por API', async ({ page }) => {
  await ingresar(page, RECEPCION)
  await abrirFichaDeRossi(page)
  await expect(page.getByRole('tab', { name: 'Archivos' })).toHaveCount(0)
  await expect(page.getByText('Alérgico a la penicilina')).toHaveCount(0)

  const sesion = await apiLogin(RECEPCION.username, RECEPCION.password)
  const odontologo = await apiLogin(ODONTOLOGO.username, ODONTOLOGO.password)
  const pacientes = (await (await odontologo.get('/api/patients?q=rossi')).json()) as { items: { id: string }[] }
  const id = pacientes.items[0]?.id
  expect((await sesion.get(`/api/patients/${id}/files`)).status()).toBe(403)
  expect((await sesion.get(`/api/patients/${id}/clinical/profile`)).status()).toBe(403)
  await sesion.dispose()
  await odontologo.dispose()
})
