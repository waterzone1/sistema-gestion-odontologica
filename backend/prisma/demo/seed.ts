import { randomBytes } from 'node:crypto'
import { buildSearchText } from '../../src/modules/patients/domain/search.js'
import { createDb } from '../../src/shared/db.js'
import { hashPassword } from '../../src/shared/password.js'

const DAY_MS = 24 * 60 * 60 * 1000
const SLOT_MS = 30 * 60 * 1000
const FIRST_HOUR = 9
const SLOTS_PER_DAY = 16

const FIRST_NAMES = [
  'Lucía', 'Mateo', 'Sofía', 'Benjamín', 'Valentina', 'Santiago', 'Martina', 'Joaquín', 'Camila', 'Tomás',
  'Julieta', 'Nicolás', 'Agustina', 'Franco', 'Florencia', 'Ignacio', 'Carolina', 'Emiliano', 'Paula', 'Lautaro',
]
const LAST_NAMES = [
  'González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Pérez', 'Gómez', 'Sánchez', 'Romero', 'Díaz',
  'Álvarez', 'Torres', 'Ruiz', 'Acosta', 'Benítez', 'Medina', 'Herrera', 'Suárez', 'Aguirre', 'Giménez',
]
const PRACTICES = [
  { code: 'CON', name: 'Consulta', price: '12000.00', minutes: 30 },
  { code: 'LIM', name: 'Limpieza dental', price: '25000.00', minutes: 30 },
  { code: 'RXP', name: 'Radiografía periapical', price: '9000.00', minutes: 30 },
  { code: 'OBT', name: 'Obturación simple', price: '38000.00', minutes: 30 },
  { code: 'EXT', name: 'Extracción simple', price: '42000.00', minutes: 30 },
  { code: 'END', name: 'Endodoncia unirradicular', price: '95000.00', minutes: 30 },
  { code: 'BLA', name: 'Blanqueamiento', price: '120000.00', minutes: 30 },
]
const COVERAGE = { provider: 'OSDE', plan: '210', copays: { CON: ['8000.00', '4000.00'], LIM: ['18000.00', '7000.00'], OBT: ['28000.00', '10000.00'] } }
const TEAM_NOTES = [
  'Prefiere turnos a primera hora.',
  'Avisar si se atrasa: viene desde lejos.',
  'Pidió factura a nombre de la empresa.',
]
const NOTES = [
  'Control de rutina. Sin hallazgos relevantes. Se indica higiene con cepillado suave.',
  'Caries oclusal. Se realiza restauración con resina. Sin complicaciones.',
  'Dolor localizado en cuadrante inferior derecho. Se indica radiografía y control.',
  'Limpieza y remoción de sarro. Se refuerza técnica de cepillado e hilo dental.',
  'Extracción simple sin complicaciones. Se entregan indicaciones postoperatorias.',
]

function rng(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] as T
}

async function main() {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Los datos de demostración no se cargan con NODE_ENV=production')
  }
  const url = process.env['DATABASE_URL']
  if (!url) throw new Error('Falta DATABASE_URL')
  const db = createDb(url)

  try {
    const organization = await db.organization.findFirst()
    if (!organization) throw new Error('Primero completá el asistente de instalación desde el navegador')
    if ((await db.patient.count()) > 0) {
      throw new Error('La base ya tiene pacientes: los datos de demostración solo se cargan en una instalación vacía')
    }
    const admin = await db.user.findFirstOrThrow({
      where: { organizationId: organization.id, roles: { some: { role: 'ADMIN' } } },
    })
    const branch = await db.branch.findFirstOrThrow({ where: { organizationId: organization.id, active: true } })

    const password = randomBytes(12).toString('base64url')
    const passwordHash = await hashPassword(password)
    const random = rng(20260930)

    const newUser = (username: string, displayName: string, role: 'DENTIST' | 'RECEPTIONIST') =>
      db.user.create({
        data: {
          organizationId: organization.id,
          username,
          displayName,
          passwordHash,
          roles: { create: [{ role }] },
          branches: { create: [{ branchId: branch.id }] },
        },
      })

    const dentistUsers = [await newUser('demo.paz', 'Dra. Ana Paz', 'DENTIST'), await newUser('demo.gil', 'Dr. Luis Gil', 'DENTIST')]
    await newUser('demo.recepcion', 'Rosa Recepción', 'RECEPTIONIST')
    const profiles = await Promise.all(
      dentistUsers.map((user, index) =>
        db.professionalProfile.create({ data: { userId: user.id, licenseNumber: `MP-DEMO-${index + 1}` } }),
      ),
    )
    await db.availabilityRule.createMany({
      data: profiles.flatMap((profile) =>
        [1, 2, 3, 4, 5].map((weekday) => ({
          professionalId: profile.id,
          branchId: branch.id,
          weekday,
          startMinute: FIRST_HOUR * 60,
          endMinute: FIRST_HOUR * 60 + SLOTS_PER_DAY * 30,
        })),
      ),
    })

    const practices = await Promise.all(
      PRACTICES.map((practice) =>
        db.practice.create({
          data: {
            organizationId: organization.id,
            code: practice.code,
            name: practice.name,
            basePrice: practice.price,
            defaultDurationMinutes: practice.minutes,
          },
        }),
      ),
    )

    const patients = []
    for (let index = 0; index < 30; index += 1) {
      const firstName = FIRST_NAMES[index % FIRST_NAMES.length] as string
      const lastName = LAST_NAMES[(index * 7 + 3) % LAST_NAMES.length] as string
      const documentNumber = String(30000000 + index * 137)
      const phone = `11 5${String(100 + index).padStart(3, '0')}-${String(1000 + index * 13).slice(0, 4)}`
      const birthDate = new Date(Date.UTC(1960 + ((index * 7) % 50), index % 12, 1 + (index % 27)))
      patients.push(
        await db.patient.create({
          data: {
            organizationId: organization.id,
            firstName,
            lastName,
            documentNumber,
            birthDate,
            phone,
            searchText: buildSearchText({ firstName, lastName, documentNumber, phone }),
          },
        }),
      )
    }

    const provider = await db.coverageProvider.create({
      data: { organizationId: organization.id, name: COVERAGE.provider, kind: 'PREPAGA', plans: { create: [{ name: COVERAGE.plan }] } },
      include: { plans: true },
    })
    const plan = provider.plans[0]
    if (!plan) throw new Error('No se pudo crear el plan de demostración')
    await db.agreement.create({
      data: {
        planId: plan.id,
        validFrom: new Date(Date.UTC(new Date().getFullYear(), 0, 1)),
        items: {
          create: Object.entries(COVERAGE.copays).map(([code, [insurerAmount, patientCopay]]) => ({
            practiceId: practices.find((practice) => practice.code === code)?.id ?? '',
            insurerAmount: insurerAmount ?? '0',
            patientCopay: patientCopay ?? '0',
          })),
        },
      },
    })
    const coverageOf = new Map<string, string>()
    for (const patient of patients.filter((_, index) => index % 3 === 0)) {
      const coverage = await db.patientCoverage.create({
        data: {
          patientId: patient.id,
          planId: plan.id,
          affiliateNumber: `61-${patient.documentNumber ?? ''}-0`,
          validFrom: new Date(Date.UTC(new Date().getFullYear(), 0, 1)),
        },
      })
      coverageOf.set(patient.id, coverage.id)
    }

    const startOfToday = new Date()
    startOfToday.setHours(FIRST_HOUR, 0, 0, 0)
    const now = Date.now()
    let services = 0
    let payments = 0
    let notes = 0
    let appointments = 0

    for (let dayOffset = -14; dayOffset <= 14; dayOffset += 1) {
      const dayStart = new Date(startOfToday.getTime() + dayOffset * DAY_MS)
      if (dayStart.getDay() === 0 || dayStart.getDay() === 6) continue
      for (const [profileIndex, profile] of profiles.entries()) {
        const taken = new Set<number>()
        const count = 3 + Math.floor(random() * 4)
        while (taken.size < count) taken.add(Math.floor(random() * SLOTS_PER_DAY))
        for (const slot of [...taken].sort((a, b) => a - b)) {
          const startsAt = new Date(dayStart.getTime() + slot * SLOT_MS)
          const endsAt = new Date(startsAt.getTime() + SLOT_MS)
          const patient = pick(patients, random)
          const practice = pick(practices, random)
          const past = endsAt.getTime() < now
          const status = past ? (random() < 0.1 ? 'NO_SHOW' : 'ATTENDED') : random() < 0.5 ? 'CONFIRMED' : 'SCHEDULED'
          const appointment = await db.appointment.create({
            data: {
              organizationId: organization.id,
              branchId: branch.id,
              patientId: patient.id,
              professionalId: profile.id,
              practiceId: practice.id,
              startsAt,
              endsAt,
              status,
              createdById: admin.id,
            },
          })
          appointments += 1
          if (status !== 'ATTENDED') continue

          await db.clinicalEntry.create({
            data: {
              patientId: patient.id,
              professionalId: profile.id,
              appointmentId: appointment.id,
              entryType: 'EVOLUTION',
              content: pick(NOTES, random),
              createdAt: endsAt,
            },
          })
          notes += 1

          const coverageId = coverageOf.get(patient.id)
          const copay = coverageId ? COVERAGE.copays[practice.code as keyof typeof COVERAGE.copays] : undefined
          const service = await db.performedService.create({
            data: {
              organizationId: organization.id,
              patientId: patient.id,
              professionalId: profile.id,
              practiceId: practice.id,
              appointmentId: appointment.id,
              price: copay?.[1] ?? practice.basePrice,
              coverageAmount: copay?.[0] ?? '0',
              patientCoverageId: copay ? coverageId : null,
              catalogPrice: practice.basePrice,
              performedAt: endsAt,
              createdById: dentistUsers[profileIndex]?.id ?? admin.id,
            },
          })
          services += 1

          const paysNow = random()
          if (paysNow < 0.7) {
            const full = paysNow < 0.45
            const amount = full ? service.price : service.price.div(2)
            await db.payment.create({
              data: {
                organizationId: organization.id,
                patientId: patient.id,
                amount,
                originalAmount: amount,
                method: pick(['CASH', 'TRANSFER', 'CARD', 'MERCADOPAGO'] as const, random),
                receivedAt: endsAt,
                createdById: admin.id,
                allocations: { create: [{ serviceId: service.id, amount }] },
              },
            })
            payments += 1
          }
        }
      }
    }

    await db.exchangeRate.create({
      data: { organizationId: organization.id, currency: 'USD', rate: '1250.00', setById: admin.id },
    })

    for (const [index, patient] of patients.slice(1, 4).entries()) {
      await db.patientNote.create({
        data: { patientId: patient.id, authorId: admin.id, content: TEAM_NOTES[index] ?? 'Sin novedades.' },
      })
    }

    const endodoncia = practices.find((practice) => practice.code === 'END')
    const obturacion = practices.find((practice) => practice.code === 'OBT')
    for (const [index, patient] of patients.slice(4, 7).entries()) {
      const profile = profiles[index % profiles.length]
      if (!profile || !endodoncia || !obturacion) break
      await db.treatmentPlan.create({
        data: {
          organizationId: organization.id,
          patientId: patient.id,
          professionalId: profile.id,
          title: 'Rehabilitación',
          ...(index === 0 ? { status: 'ACCEPTED' as const, acceptedAt: new Date(), acceptedById: admin.id } : {}),
          items: {
            create: [
              { practiceId: endodoncia.id, tooth: 36, agreedPrice: index === 0 ? '90000.00' : null },
              { practiceId: obturacion.id, tooth: 46, surfaces: ['O', 'M'], agreedPrice: index === 0 ? '35000.00' : null },
            ],
          },
        },
      })
      await db.toothFinding.createMany({
        data: [
          { patientId: patient.id, professionalId: profile.id, tooth: 36, surface: 'O', condition: 'CARIES' },
          { patientId: patient.id, professionalId: profile.id, tooth: 18, condition: 'MISSING' },
        ],
      })
    }

    const covered = await db.performedService.findMany({
      where: { organizationId: organization.id, patientCoverageId: { not: null }, performedAt: { lt: new Date() } },
      select: { id: true, coverageAmount: true },
    })
    if (covered.length > 0) {
      await db.liquidation.create({
        data: {
          organizationId: organization.id,
          providerId: provider.id,
          periodFrom: new Date(Date.now() - 15 * DAY_MS),
          periodTo: new Date(),
          createdById: admin.id,
          items: { create: covered.map((service) => ({ serviceId: service.id, claimedAmount: service.coverageAmount })) },
        },
      })
    }

    process.stdout.write(
      [
        `Pacientes: ${patients.length}`,
        `Turnos: ${appointments}`,
        `Notas clínicas: ${notes}`,
        `Prestaciones: ${services}`,
        `Pagos: ${payments}`,
        `Pacientes con ${COVERAGE.provider} ${COVERAGE.plan}: ${coverageOf.size}`,
        `Prestaciones en la liquidación en borrador: ${covered.length}`,
        '',
        'Usuarios de demostración (misma clave para los tres):',
        '  demo.paz         odontóloga',
        '  demo.gil         odontólogo',
        '  demo.recepcion   recepción',
        `  clave: ${password}`,
        '',
      ].join('\n'),
    )
  } finally {
    await db.$disconnect()
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
