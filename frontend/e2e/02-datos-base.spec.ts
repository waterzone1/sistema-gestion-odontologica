import { expect, test } from '@playwright/test'
import { ADMIN_PASSWORD, ADMIN_USERNAME, apiLogin, ODONTOLOGO, provisionUser, RECEPCION } from './api'

test('el administrador prepara usuarios, práctica y un paciente para los escenarios siguientes', async () => {
  const admin = await apiLogin(ADMIN_USERNAME, ADMIN_PASSWORD)
  const branches = (await (await admin.get('/api/branches')).json()) as { id: string }[]
  const branchIds = [branches[0]?.id ?? '']

  await provisionUser(admin, {
    username: RECEPCION.username,
    displayName: RECEPCION.displayName,
    roles: ['RECEPTIONIST'],
    branchIds,
    password: RECEPCION.password,
  })
  await provisionUser(admin, {
    username: ODONTOLOGO.username,
    displayName: ODONTOLOGO.displayName,
    roles: ['DENTIST'],
    branchIds,
    password: ODONTOLOGO.password,
    licenseNumber: 'MP-100',
  })

  const practica = await admin.post('/api/practices', {
    code: 'CON',
    name: 'Consulta',
    basePrice: '10000',
    defaultDurationMinutes: 30,
  })
  expect(practica.status()).toBe(201)

  const paciente = await admin.post('/api/patients', {
    firstName: 'Luca',
    lastName: 'Rossi',
    documentNumber: '31222333',
    phone: '11 6000-1111',
  })
  expect(paciente.status()).toBe(201)
  await admin.dispose()
})
