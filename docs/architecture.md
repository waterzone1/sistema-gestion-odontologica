# Arquitectura

Aplicación web cliente-servidor con frontend y backend separados, comunicados por REST sobre HTTPS. El backend es un monolito modular. Una instalación pertenece a una única organización.

Los diagramas C4 están en [`c4/`](c4/) (contexto, contenedores y componentes del backend) y el modelo de datos en [`erd.md`](erd.md).

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query |
| Backend | Node.js, Express, TypeScript, Prisma, Zod |
| Base de datos | PostgreSQL 16 |
| Proxy | Caddy (TLS) |
| Infraestructura | Docker Compose sobre Ubuntu Server |
| Pruebas | Vitest, Supertest, Playwright |
| CI | GitHub Actions |

## Flujo de una solicitud

```text
navegador --HTTPS--> Caddy --/--> frontend (Next.js)
                        \--/api--> backend (Express) --> PostgreSQL
```

Frontend y API se sirven desde el mismo origen a través del proxy, por lo que no se necesita CORS y la cookie de sesión no cruza sitios. En desarrollo, Next reenvía `/api` al backend para conservar ese mismo esquema.

## Backend

Cada módulo sigue el flujo `route → controller → service → repository (Prisma)`. Las reglas de dominio (disponibilidad, solapamiento, saldo, permisos) son funciones puras dentro de `domain/`, testeables sin base de datos ni HTTP.

```text
backend/src/
├── config/        variables de entorno validadas al arrancar
├── middleware/    logging, errores, 404 (luego sesión, CSRF, autorización)
├── modules/<x>/   routes, controller, service, schemas, domain
├── openapi/       generación del documento OpenAPI
└── shared/        logger, errores, acceso a base de datos
```

### Contrato de la API

Los esquemas Zod validan la entrada y generan el documento OpenAPI (`docs/openapi.yaml`, también servido en `/api/docs`). El frontend deriva sus tipos de ese documento con `openapi-typescript`. La CI falla si el archivo o los tipos quedan desactualizados.

### Errores

Todas las respuestas de error usan el mismo formato:

```json
{ "error": { "code": "APPOINTMENT_CONFLICT", "message": "…", "details": {} } }
```

### Registro

Logs estructurados en JSON con un `X-Request-Id` generado por el servidor. Los encabezados de autorización y cookies, y los campos `password` y `passwordHash`, se ocultan.

## Seguridad

- **Contraseñas:** Argon2id (19 MiB, t=2, p=1). Mínimo 10 caracteres, sin claves comunes ni el nombre de usuario. El login tarda lo mismo exista o no el usuario y responde con el mismo mensaje.
- **Sesiones:** en PostgreSQL. La cookie `sid` (`HttpOnly`, `SameSite=Lax`, `Secure` en producción) lleva un token aleatorio de 32 bytes y en la base solo queda su hash. Vencen a las 8 horas de inactividad y a los 7 días en total. Desactivar un usuario o revocar sus sesiones las invalida en la siguiente solicitud. Sin JWT.
- **CSRF:** en toda escritura se verifica que el header `Origin` sea el de la aplicación y, si hay sesión, que llegue el token de la sesión en `X-CSRF-Token`.
- **Fuerza bruta:** 10 intentos fallidos cada 15 minutos por usuario e IP (`429`), sin bloquear la cuenta.
- **Información clínica completa:** perfil clínico (alertas, alergias, medicación, antecedentes) versionado de solo agregado; odontograma FDI (permanente y temporal) donde la condición de cada pieza o superficie se registra como hallazgo de solo agregado y el estado actual se deriva del último registro, separado de lo planificado (ítems del plan de tratamiento) y de lo realizado (prestaciones con pieza). Todo esto es solo para odontólogos y cada consulta queda auditada sin contenido.
- **Archivos clínicos:** PDF, JPG o PNG verificados por su contenido (no por la extensión), con tamaño máximo configurable (`FILE_MAX_MB`, 20 por defecto). Se guardan fuera de cualquier carpeta pública (`FILES_DIR`, un volumen de Docker en producción) con nombre interno aleatorio, y se descargan solo a través del backend con sesión, permiso clínico, `nosniff` y sin caché. No se borran: se archivan. Cada descarga queda auditada.
- **Plan de tratamiento y presupuesto:** el odontólogo arma los ítems (práctica, pieza, superficies) sin ver importes; recepción y administración fijan el precio acordado y registran la aceptación sin ver piezas ni notas clínicas. El odontólogo marca un ítem como realizado (hecho clínico) y queda para que recepción registre la prestación con el precio acordado. Si recepción la registra antes, el ítem queda realizado y, si esa prestación se anula, vuelve a quedar pendiente; un ítem que el odontólogo marcó realizado sigue realizado y vuelve a estar para facturar.
- **Reparto de tareas:** recepción administra el día a día (pacientes, agenda, profesionales con sus horarios y excepciones, catálogo de prácticas y precios, prestaciones y cobros, anulaciones del mismo día). Administración queda para lo sensible: usuarios y roles, sedes y anulaciones de días anteriores.
- **Autorización:** cada ruta declara una política (pública, autenticada o un permiso) y hay un test que falla si alguna no lo hace. Los permisos efectivos son la unión de los roles y se resuelven en cada solicitud, así que un cambio de rol rige de inmediato. Toda consulta se filtra por la organización de la sesión.
- **Clave temporal:** el usuario creado o restablecido por un administrador solo puede cambiar su contraseña o salir hasta que lo haga.
- **Instalación inicial:** el asistente exige un código de un solo uso que el servidor imprime en su registro al arrancar sin configurar, y una vez completado deja de estar disponible.
- **Auditoría:** registro solo de agregado (un trigger de la base rechaza modificar o borrar) que no guarda secretos. Administración lo consulta en una pantalla con filtros por fecha y acción.
- **Coberturas y liquidaciones:** recepción carga obras sociales y prepagas, sus planes y convenios (lo que cubre la cobertura y el coseguro por práctica, y si exige autorización). Al registrar una prestación de un paciente con cobertura vigente y convenio para esa práctica, al paciente le queda el coseguro y el resto queda a cargo de la cobertura. Las liquidaciones agrupan esas prestaciones por cobertura y período, se exportan en CSV, registran aprobación, débito o rechazo por prestación y el pago. Una prestación liquidada no se puede anular sin antes anular la liquidación o registrar el rechazo.
- **Backups y restauración:** un backup es un `pg_dump` completo más los archivos clínicos y un manifest con checksums SHA-256, empaquetados en un solo archivo en un volumen distinto al de los datos. Se genera uno automático por día (`BACKUP_HOUR`) y a mano desde la pantalla de administración; se conservan 7 diarios, 4 semanales y los últimos 10 manuales. La restauración, solo para administración y con confirmación escrita, verifica el checksum y la versión del esquema, pone el sistema en mantenimiento (las demás solicitudes reciben 503), restaura la base en una transacción y los archivos, y comprueba que los conteos coincidan con el manifest antes de volver a operar.
- Los roles Administrador y Recepcionista no acceden a información clínica; el backend responde 403 aunque la interfaz oculte la opción.
- **Datos clínicos:** solo el rol Odontólogo tiene los permisos `clinical:*`. Cada apertura de una historia queda auditada (sin contenido). Las notas son de solo agregado: un trigger de la base rechaza modificarlas o borrarlas y se corrigen con una corrección vinculada a la original.
- **Dinero:** los importes se guardan con dos decimales y se calculan en centavos enteros. El saldo no se guarda: es siempre prestaciones vigentes menos pagos vigentes. Un cobro puede combinar varios medios de pago y usar el saldo a favor; se aplica a las prestaciones pendientes más antiguas (o a las elegidas) y lo que excede queda como saldo a favor. Solo recepción y administración registran prestaciones; el odontólogo ve su historial sin importes. Recepción y administración pueden ajustar el precio (nunca por debajo de lo pagado, auditado con el valor anterior). Recepción anula pagos y prestaciones solo el mismo día; administración, siempre. Las operaciones sobre la cuenta de un paciente se serializan con un bloqueo de su fila. Un trigger impide borrar prestaciones y pagos, y solo admite su anulación con motivo o el ajuste del precio.
- **Dólares y caja:** recepción o administración cargan la cotización del dólar (historial de solo agregado). Un cobro en dólares guarda moneda, monto original, cotización y equivalente en pesos; si la cotización cambió mientras se cobraba, el backend rechaza el cobro para que se revise. La caja del día suma por medio de pago y moneda, lista las anulaciones aparte y no cuenta el uso de saldo a favor.
- **Control de facturación:** un turno atendido queda pendiente de cerrar hasta que se registra la prestación, se marca como sesión de un ítem del plan (tratamientos de varios turnos que se cobran una vez) o se cierra sin cargo con motivo. Los pendientes y los ítems realizados sin prestación se avisan en el inicio y en la caja.
- **Mensajes sobre el paciente:** recepción, odontólogos y administración se dejan mensajes con autor y fecha, visibles en la ficha, en el turno y en el cobro. No se editan ni se borran: se archivan.
- **Preferencias por usuario:** tema, orden del menú, pantalla de inicio y vista, horario e intervalo de la agenda, y sábados y domingos. Ocultar un fin de semana solo se permite si ningún profesional atiende ese día, y la agenda igual muestra los días con turnos o disponibilidad.
- **Reportes:** turnos por estado y profesional (con ausentismo), cobranzas por día y medio de pago, prestaciones por profesional y práctica, y saldos pendientes, filtrables por período, sede y profesional y exportables a CSV. Los ve administración y recepción.
- **Importación de pacientes:** CSV (plantilla descargable, separador punto y coma o coma) con vista previa y errores por fila antes de importar; se omiten las filas inválidas, los documentos repetidos y los pacientes que ya existen.
- **Recordatorios:** bandeja interna con un aviso por turno del día elegido. No hay proveedor externo: recepción abre WhatsApp con el mensaje ya escrito al celular del paciente, lo envía y registra si confirmó (lo que confirma el turno).
- **Uso diario:** buscador de pacientes en el encabezado, menú desplegable en el celular y una guía de 4 a 6 pasos según el rol al primer ingreso, que se puede repetir con Ayuda.
- **Agenda:** cada profesional tiene un horario semanal por sede (en la zona horaria del consultorio) y excepciones con fecha: vacaciones, ausencias y bloqueos impiden dar turnos y un horario extraordinario los habilita. Un turno fuera del horario semanal o de una práctica que el profesional no tiene habilitada no se bloquea: el backend responde con advertencias y hay que confirmarlas, y la confirmación queda auditada. Solo administración puede dar un turno cuando el profesional está de vacaciones, ausente o bloqueado, con motivo y auditado. Nada permite superponer turnos de un mismo profesional, que sigue garantizando la base. Las excepciones no se borran: se revocan.
- No hay borrado físico: los usuarios y las sedes se desactivan; los datos clínicos y los pagos se corrigen con una corrección o una anulación.
