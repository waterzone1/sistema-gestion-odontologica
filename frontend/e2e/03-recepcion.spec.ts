import { expect, test, type Page } from '@playwright/test'
import { RECEPCION } from './api'

test.describe.configure({ mode: 'serial' })

const captura = (nombre: string) => `test-results/screens/${nombre}.png`

let page: Page

async function loginUi(target: Page, username: string, password: string) {
  await target.goto('/login')
  await target.getByLabel('Usuario').fill(username)
  await target.getByLabel('Contraseña').fill(password)
  await target.getByRole('button', { name: 'Ingresar' }).click()
  await expect(target).toHaveURL(/\/dashboard$/)
}

test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext()).newPage()
  await loginUi(page, RECEPCION.username, RECEPCION.password)
})

test.afterAll(async () => {
  await page.context().close()
})

test('recepción da de alta un paciente y llega a su ficha', async () => {
  await page.getByRole('link', { name: 'Pacientes' }).first().click()
  await expect(page.getByRole('heading', { name: 'Pacientes' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Rossi, Luca' })).toBeVisible()

  await page.getByRole('button', { name: 'Nuevo paciente' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Nombre', { exact: true }).fill('Ana')
  await dialogo.getByLabel('Apellido').fill('Gómez')
  await dialogo.getByLabel('Número de documento').fill('30.123.456')
  await dialogo.getByLabel('Fecha de nacimiento').fill('1985-03-10')
  await dialogo.getByLabel('Teléfono').fill('11 5555-1234')
  await page.screenshot({ path: captura('10-paciente-alta') })
  await dialogo.getByRole('button', { name: 'Crear paciente' }).click()

  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: /Gómez, Ana/ })).toBeVisible()
  await expect(page.getByText('DNI 30.123.456').first()).toBeVisible()
  await page.screenshot({ path: captura('11-paciente-ficha'), fullPage: true })
})

test('la búsqueda ignora tildes y encuentra por documento y teléfono', async () => {
  await page.goto('/patients')
  const buscador = page.getByLabel('Buscar paciente')
  await buscador.fill('gomez')
  await expect(page.getByRole('link', { name: 'Gómez, Ana' })).toBeVisible()
  await buscador.fill('30123456')
  await expect(page.getByRole('link', { name: 'Gómez, Ana' })).toBeVisible()
  await buscador.fill('5555-12')
  await expect(page.getByRole('link', { name: 'Gómez, Ana' })).toBeVisible()
  await buscador.fill('inexistente')
  await expect(page.getByText('No se encontraron pacientes')).toBeVisible()
  await page.screenshot({ path: captura('12-pacientes-busqueda') })
})

test('no permite dar de alta el mismo documento dos veces', async () => {
  await page.goto('/patients')
  await page.getByRole('button', { name: 'Nuevo paciente' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Nombre', { exact: true }).fill('Otra')
  await dialogo.getByLabel('Apellido').fill('Persona')
  await dialogo.getByLabel('Número de documento').fill('30123456')
  await dialogo.getByRole('button', { name: 'Crear paciente' }).click()
  await expect(dialogo.getByText('Ya existe un paciente con ese documento')).toBeVisible()
  await expect(dialogo.getByRole('link', { name: /Ver el paciente existente/ })).toBeVisible()
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
})

test('edita el teléfono y archiva al paciente sin borrarlo', async () => {
  await page.goto('/patients')
  await page.getByRole('link', { name: 'Gómez, Ana' }).click()
  await page.getByRole('button', { name: 'Editar' }).click()
  const dialogo = page.getByRole('dialog')
  await dialogo.getByLabel('Teléfono').fill('11 4444-0000')
  await dialogo.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('11 4444-0000').first()).toBeVisible()

  await page.getByRole('button', { name: 'Archivar' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Archivar' }).click()
  await expect(page.getByText('Archivado').first()).toBeVisible()

  await page.goto('/patients')
  await expect(page.getByRole('link', { name: 'Rossi, Luca' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Gómez, Ana' })).toHaveCount(0)
  await page.getByLabel('Estado').selectOption('archived')
  await expect(page.getByRole('link', { name: 'Gómez, Ana' })).toBeVisible()
})
