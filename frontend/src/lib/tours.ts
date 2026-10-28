import type { Permission, SessionUser } from './api'
import { can } from './permissions'

export interface TourStep {
  target?: string
  title: string
  text: string
  permission?: Permission
}

interface Tour {
  id: string
  title: string
  steps: TourStep[]
}

export const ONBOARDING_TOUR = 'inicio'

const TOURS: Tour[] = [
  {
    id: ONBOARDING_TOUR,
    title: 'Primeros pasos',
    steps: [
      {
        title: 'Bienvenido/a',
        text: 'Este sistema reúne la agenda, las fichas de los pacientes y la cuenta de cada uno. Te mostramos dónde está cada cosa en unos pasos.',
      },
      {
        target: 'nav',
        title: 'Menú',
        text: 'Acá están las secciones que tu rol tiene habilitadas. Lo que no te corresponde no aparece.',
      },
      {
        target: 'nav-toggle',
        title: 'Menú',
        text: 'Tocá este botón para abrir las secciones que tu rol tiene habilitadas.',
      },
      {
        target: 'search',
        title: 'Buscador de pacientes',
        text: 'Desde cualquier pantalla, escribí apellido, DNI o teléfono y entrá directo a la ficha.',
        permission: 'patients:read',
      },
      {
        target: 'user',
        title: 'Tu usuario',
        text: 'Tu nombre y tus roles. Con Salir cerrás la sesión; hacelo siempre en una computadora compartida.',
      },
      {
        target: 'connection',
        title: 'Conexión con el servidor',
        text: 'El punto verde indica que el sistema está conectado. Si se pone rojo, no guardes nada hasta que vuelva.',
      },
      {
        target: 'help',
        title: 'Ayuda',
        text: 'Cada pantalla tiene su propio recorrido, que aparece la primera vez que entrás. Con este botón lo repetís cuando quieras.',
      },
    ],
  },
  {
    id: 'dashboard',
    title: 'Inicio',
    steps: [
      {
        target: 'page-title',
        title: 'Tu resumen',
        text: 'El inicio cambia según tu rol: turnos del día, lo que falta confirmar o facturar, y los saldos pendientes.',
      },
      {
        target: 'dashboard-content',
        title: 'Pendientes del día',
        text: 'Cada tarjeta te lleva a lo que hay que resolver. Si no hay nada pendiente, la tarjeta lo dice.',
      },
    ],
  },
  {
    id: 'agenda',
    title: 'Agenda',
    steps: [
      {
        target: 'page-actions',
        title: 'Dar un turno',
        text: 'Con Nuevo turno, o seleccionando un horario libre en la grilla. El sistema no deja superponer turnos de un mismo profesional.',
        permission: 'appointments:manage',
      },
      {
        target: 'agenda-filters',
        title: 'Filtros',
        text: 'Elegí la sede, un profesional, qué estados ver o saltá a una fecha.',
      },
      {
        target: 'agenda-calendar',
        title: 'La grilla',
        text: 'Cada turno muestra el paciente y la práctica, con el color del profesional. Tocalo para ver el detalle, confirmarlo o marcarlo atendido. Para reprogramar, arrastralo.',
      },
      {
        target: 'agenda-legend',
        title: 'Referencias',
        text: 'Cómo se ve un turno en cada estado: pendiente, confirmado, atendido, ausente o cancelado.',
      },
    ],
  },
  {
    id: 'patients',
    title: 'Pacientes',
    steps: [
      {
        target: 'page-actions',
        title: 'Alta e importación',
        text: 'Cargá un paciente nuevo o importá varios desde una planilla.',
        permission: 'patients:write',
      },
      {
        target: 'patients-search',
        title: 'Búsqueda',
        text: 'Buscá por apellido, nombre, DNI o teléfono, sin importar las tildes. También podés ver los archivados.',
      },
      {
        target: 'patients-list',
        title: 'Listado',
        text: 'Tocá un paciente para abrir su ficha.',
      },
    ],
  },
  {
    id: 'patient',
    title: 'Ficha del paciente',
    steps: [
      {
        target: 'page-title',
        title: 'Datos del paciente',
        text: 'Nombre, documento y contacto. Las alertas clínicas se ven arriba para quien atiende.',
      },
      {
        target: 'patient-notes',
        title: 'Mensajes del equipo',
        text: 'Notas internas entre recepción y odontólogos: aparecen también al dar turnos y al cobrar.',
      },
      {
        target: 'patient-tabs',
        title: 'Pestañas',
        text: 'Turnos, cuenta y cobros, historia clínica, odontograma, tratamiento y archivos. Cada rol ve solo lo que le corresponde.',
      },
    ],
  },
  {
    id: 'cash',
    title: 'Caja',
    steps: [
      {
        target: 'page-title',
        title: 'Caja del día',
        text: 'Lo cobrado en el día por medio de pago y moneda. Las anulaciones se ven aparte y no suman.',
      },
      {
        target: 'cash-day',
        title: 'Otro día',
        text: 'Elegí la fecha para ver la caja de un día anterior.',
      },
    ],
  },
  {
    id: 'reminders',
    title: 'Recordatorios',
    steps: [
      {
        target: 'page-actions',
        title: 'Generar',
        text: 'Crea un aviso por cada turno del día elegido. Si un turno se reprograma, el aviso viejo se descarta solo.',
      },
      {
        target: 'reminders-list',
        title: 'Enviar y confirmar',
        text: 'WhatsApp abre el chat con el mensaje escrito. Después marcalo como enviado; cuando el paciente responde, confirmalo y el turno queda confirmado.',
      },
    ],
  },
  {
    id: 'reports',
    title: 'Reportes',
    steps: [
      {
        target: 'reports-tabs',
        title: 'Tipos de reporte',
        text: 'Turnos y ausentismo, cobranzas, prestaciones y saldos pendientes.',
      },
      {
        target: 'reports-filters',
        title: 'Período y filtros',
        text: 'Elegí el período, la sede y el profesional. Cada tabla se exporta a CSV para abrirla en Excel.',
      },
    ],
  },
  {
    id: 'coverages',
    title: 'Coberturas',
    steps: [
      {
        target: 'page-actions',
        title: 'Obras sociales y prepagas',
        text: 'Cargá cada cobertura con sus planes. Después asignala a los pacientes desde su ficha.',
      },
      {
        target: 'coverages-list',
        title: 'Convenios',
        text: 'Por plan, qué paga la cobertura y qué paga el paciente (coseguro) en cada práctica, y si exige autorización.',
      },
    ],
  },
  {
    id: 'liquidations',
    title: 'Liquidaciones',
    steps: [
      {
        target: 'page-actions',
        title: 'Nueva liquidación',
        text: 'Agrupa las prestaciones de una cobertura en un período para presentarlas.',
      },
      {
        target: 'liquidations-list',
        title: 'Seguimiento',
        text: 'Presentá, registrá lo aprobado, debitado o rechazado y, al final, el pago. Se exporta a CSV.',
      },
    ],
  },
  {
    id: 'professionals',
    title: 'Profesionales',
    steps: [
      {
        target: 'page-title',
        title: 'Profesionales',
        text: 'Elegí un profesional para cargar su horario semanal, vacaciones o bloqueos y las prácticas que realiza.',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Configuración',
    steps: [
      {
        target: 'page-title',
        title: 'Tus preferencias',
        text: 'Tema, orden del menú, pantalla de inicio y cómo se ve la agenda. Se guardan en tu usuario.',
      },
      {
        target: 'settings-modules',
        title: 'Módulos',
        text: 'El administrador activa acá las funciones opcionales, como coberturas y liquidaciones.',
        permission: 'organization:manage',
      },
    ],
  },
  {
    id: 'users',
    title: 'Usuarios',
    steps: [
      {
        target: 'page-actions',
        title: 'Nuevo usuario',
        text: 'Cada persona entra con su usuario. La clave temporal se cambia en el primer ingreso.',
      },
      {
        target: 'page-title',
        title: 'Roles',
        text: 'Una persona puede tener varios roles. Administración y recepción nunca ven información clínica.',
      },
    ],
  },
  {
    id: 'audit',
    title: 'Auditoría',
    steps: [
      {
        target: 'audit-filters',
        title: 'Filtros',
        text: 'Buscá por fechas o por tipo de acción.',
      },
      {
        target: 'audit-list',
        title: 'Quién hizo qué',
        text: 'Cada fila dice qué se hizo, a quién o a qué afectó, quién lo hizo y cuándo. No se puede modificar ni borrar.',
      },
    ],
  },
  {
    id: 'backups',
    title: 'Backups',
    steps: [
      {
        target: 'page-actions',
        title: 'Backup manual',
        text: 'Además del backup automático diario, podés generar uno en cualquier momento.',
      },
      {
        target: 'backups-list',
        title: 'Restaurar',
        text: 'Desde la lista se descarga o se restaura un backup. Restaurar reemplaza todos los datos actuales.',
      },
    ],
  },
]

const ROUTES: [RegExp, string][] = [
  [/^\/dashboard/, 'dashboard'],
  [/^\/agenda/, 'agenda'],
  [/^\/patients\/import/, ''],
  [/^\/patients\/[^/]+/, 'patient'],
  [/^\/patients/, 'patients'],
  [/^\/cash/, 'cash'],
  [/^\/reminders/, 'reminders'],
  [/^\/reports/, 'reports'],
  [/^\/coverages/, 'coverages'],
  [/^\/liquidations/, 'liquidations'],
  [/^\/professionals/, 'professionals'],
  [/^\/settings/, 'settings'],
  [/^\/admin\/users/, 'users'],
  [/^\/admin\/audit/, 'audit'],
  [/^\/admin\/backups/, 'backups'],
]

export const TOUR_IDS = TOURS.map((tour) => tour.id)

export function tourForPath(pathname: string): string | null {
  const match = ROUTES.find(([pattern]) => pattern.test(pathname))
  return match && match[1] ? match[1] : null
}

export function tourSteps(id: string, user: Pick<SessionUser, 'permissions'>): TourStep[] {
  const tour = TOURS.find((t) => t.id === id)
  return (tour?.steps ?? []).filter((step) => !step.permission || can(user, step.permission))
}

export function tourTitle(id: string): string {
  return TOURS.find((t) => t.id === id)?.title ?? 'Ayuda'
}
