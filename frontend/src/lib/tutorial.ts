import type { SessionUser } from './api'
import { can } from './permissions'

export interface TutorialStep {
  title: string
  text: string
}

export function tutorialSteps(user: Pick<SessionUser, 'permissions'>): TutorialStep[] {
  const steps: TutorialStep[] = [
    {
      title: 'Bienvenido/a',
      text: 'Este sistema reúne la agenda, las fichas de los pacientes y la cuenta de cada uno. Te mostramos lo principal en unos pasos.',
    },
    {
      title: 'Menú y buscador',
      text: 'A la izquierda (o en el botón Menú, en el celular) están las secciones que tu rol tiene habilitadas. Arriba, el buscador encuentra pacientes por apellido, DNI o teléfono desde cualquier pantalla.',
    },
  ]
  if (can(user, 'appointments:manage')) {
    steps.push({
      title: 'Agenda y turnos',
      text: 'En Agenda das turnos arrastrando sobre la grilla o con Nuevo turno. Los turnos atendidos que quedan sin cobrar aparecen en el inicio, y en Recordatorios mandás los avisos del día siguiente por WhatsApp.',
    })
  }
  if (can(user, 'payments:create')) {
    steps.push({
      title: 'Cobros y caja',
      text: 'Desde la ficha del paciente registrás prestaciones y cobros, en pesos o dólares. La Caja muestra lo cobrado en el día por medio de pago.',
    })
  }
  if (can(user, 'clinical:write')) {
    steps.push({
      title: 'Atención clínica',
      text: 'En la ficha del paciente tenés la historia clínica, el odontograma, los archivos y el plan de tratamiento. Al terminar un ítem del plan, marcalo como realizado y recepción lo factura.',
    })
  }
  if (can(user, 'users:manage')) {
    steps.push({
      title: 'Administración',
      text: 'Usuarios, sedes, auditoría, backups y reportes están en Administración. Los backups se hacen solos todos los días y se pueden restaurar desde ahí.',
    })
  }
  steps.push({
    title: 'Ayuda',
    text: 'Podés volver a ver esta guía cuando quieras con el botón Ayuda, arriba a la derecha. En Configuración elegís el tema, el orden del menú y cómo se ve la agenda.',
  })
  return steps
}
