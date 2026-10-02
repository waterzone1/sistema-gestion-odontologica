import { expect, test, type BrowserContext, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

const CLAVE_ADMIN = 'Clave-del-admin-2026'
const CLAVE_TEMPORAL = 'Temporal-2026-ok'
const CLAVE_NUEVA = 'Clave-nueva-de-recepcion-77'
const captura = (nombre: string) => `test-results/screens/${nombre}.png`

let adminCtx: BrowserContext
let recepCtx: BrowserContext
let admin: Page
let recepcion: Page

test.beforeAll(async ({ browser }) => {
  adminCtx = await browser.newContext()
  recepCtx = await browser.newContext()
  admin = await adminCtx.newPage()
  recepcion = await recepCtx.newPage()
})

test.afterAll(async () => {
  await adminCtx.close()
  await recepCtx.close()
})

test('la configuración inicial crea la organización y deja al administrador adentro', async () => {
  const token = process.env['E2E_SETUP_TOKEN'] ?? ''
  await admin.goto('/')
  await expect(admin).toHaveURL(/\/setup$/)

  await admin.getByLabel('Código de instalación').fill(token)
  await admin.getByLabel('Nombre de la organización').fill('Consultorio Demo')
  await admin.screenshot({ path: captura('01-setup-paso-1') })
  await admin.getByRole('button', { name: 'Siguiente' }).click()

  await admin.getByLabel('Nombre de la sede').fill('Sede Central')
  await admin.getByLabel('Dirección (opcional)').fill('Av. Corrientes 1234')
  await admin.getByRole('button', { name: 'Siguiente' }).click()

  await admin.getByLabel('Nombre y apellido').fill('Marta Gómez')
  await admin.getByLabel('Usuario').fill('marta')
  await admin.getByLabel('Contraseña', { exact: true }).fill(CLAVE_ADMIN)
  await admin.getByLabel('Repetir contraseña').fill(CLAVE_ADMIN)
  await admin.screenshot({ path: captura('02-setup-paso-3') })
  await admin.getByRole('button', { name: 'Finalizar' }).click()

  await expect(admin).toHaveURL(/\/dashboard$/)
  await expect(admin.getByRole('heading', { name: 'Hola, Marta Gómez' })).toBeVisible()
  await expect(admin.getByRole('link', { name: 'Usuarios' }).first()).toBeVisible()
  await admin.screenshot({ path: captura('03-dashboard-admin'), fullPage: true })
})

test('el asistente de configuración ya no está disponible', async ({ page }) => {
  await page.goto('/setup')
  await expect(page).toHaveURL(/\/login$/)
})

test('el administrador crea un usuario de recepción', async () => {
  await admin.getByRole('link', { name: 'Usuarios' }).first().click()
  await expect(admin.getByRole('heading', { name: 'Usuarios' })).toBeVisible()

  await admin.getByRole('button', { name: 'Nuevo usuario' }).click()
  const dialogo = admin.getByRole('dialog')
  await dialogo.getByLabel('Nombre y apellido').fill('Lucía Fernández')
  await dialogo.getByLabel('Usuario').fill('lucia')
  await dialogo.getByLabel('Contraseña temporal').fill(CLAVE_TEMPORAL)
  await dialogo.getByLabel('Recepción').check()
  await dialogo.getByLabel('Sede Central').check()
  await admin.screenshot({ path: captura('04-nuevo-usuario') })
  await dialogo.getByRole('button', { name: 'Crear usuario' }).click()

  await expect(dialogo).toBeHidden()
  const fila = admin.getByRole('row', { name: /Lucía Fernández/ })
  await expect(fila).toContainText('Recepción')
  await expect(fila).toContainText('Clave temporal')
  await admin.screenshot({ path: captura('05-lista-usuarios'), fullPage: true })
})

test('recepción debe cambiar la clave temporal y no ve la administración', async () => {
  await recepcion.goto('/login')
  await recepcion.getByLabel('Usuario').fill('lucia')
  await recepcion.getByLabel('Contraseña').fill(CLAVE_TEMPORAL)
  await recepcion.getByRole('button', { name: 'Ingresar' }).click()

  await expect(recepcion).toHaveURL(/\/cambiar-clave$/)
  await recepcion.getByLabel('Contraseña actual', { exact: true }).fill(CLAVE_TEMPORAL)
  await recepcion.getByLabel('Nueva contraseña', { exact: true }).fill(CLAVE_NUEVA)
  await recepcion.getByLabel('Repetir nueva contraseña').fill(CLAVE_NUEVA)
  await recepcion.getByRole('button', { name: 'Guardar contraseña' }).click()

  await expect(recepcion).toHaveURL(/\/dashboard$/)
  await expect(recepcion.getByRole('heading', { name: 'Hola, Lucía Fernández' })).toBeVisible()
  await expect(recepcion.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
  await expect(recepcion.getByText('Administración')).toHaveCount(0)
  await recepcion.screenshot({ path: captura('06-dashboard-recepcion'), fullPage: true })
})

test('recepción no accede a la administración ni por la interfaz ni por la API', async () => {
  await recepcion.goto('/admin/users')
  await expect(recepcion).toHaveURL(/\/dashboard$/)

  const usuarios = await recepcion.request.get('/api/users')
  expect(usuarios.status()).toBe(403)
  expect(await usuarios.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })

  const crear = await recepcion.request.post('/api/users', { data: {} })
  expect(crear.status()).toBe(403)

  const profesionales = await recepcion.request.get('/api/professionals')
  expect(profesionales.status()).toBe(200)
})

test('dar de baja al usuario cierra su sesión abierta', async () => {
  await admin.reload()
  const fila = admin.getByRole('row', { name: /Lucía Fernández/ })
  await fila.getByRole('button', { name: 'Dar de baja' }).click()
  await admin.getByRole('dialog').getByRole('button', { name: 'Dar de baja' }).click()
  await expect(fila).toContainText('De baja')
  await admin.screenshot({ path: captura('07-usuario-de-baja'), fullPage: true })

  const me = await recepcion.request.get('/api/auth/me')
  expect(me.status()).toBe(401)
  await recepcion.reload()
  await expect(recepcion).toHaveURL(/\/login$/)
})

test('el usuario dado de baja no puede volver a ingresar', async () => {
  await recepcion.getByLabel('Usuario').fill('lucia')
  await recepcion.getByLabel('Contraseña').fill(CLAVE_NUEVA)
  await recepcion.getByRole('button', { name: 'Ingresar' }).click()
  await expect(recepcion.getByText('Usuario o contraseña incorrectos')).toBeVisible()
  await recepcion.screenshot({ path: captura('08-login-rechazado') })
})

test('el administrador puede cerrar sesión', async () => {
  await admin.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(admin).toHaveURL(/\/login$/)
})

test('la pantalla de ingreso se adapta al celular', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const movil = await ctx.newPage()
  await movil.goto('/login')
  await expect(movil.getByRole('button', { name: 'Ingresar' })).toBeVisible()
  const desborda = await movil.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(desborda).toBe(false)
  await movil.screenshot({ path: captura('09-login-movil') })
  await ctx.close()
})
