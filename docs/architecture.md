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
- **Autorización:** cada ruta declara una política (pública, autenticada o un permiso) y hay un test que falla si alguna no lo hace. Los permisos efectivos son la unión de los roles y se resuelven en cada solicitud, así que un cambio de rol rige de inmediato. Toda consulta se filtra por la organización de la sesión.
- **Clave temporal:** el usuario creado o restablecido por un administrador solo puede cambiar su contraseña o salir hasta que lo haga.
- **Instalación inicial:** el asistente exige un código de un solo uso que el servidor imprime en su registro al arrancar sin configurar, y una vez completado deja de estar disponible.
- **Auditoría:** registro solo de agregado (un trigger de la base rechaza modificar o borrar) que no guarda secretos.
- Los roles Administrador y Recepcionista no acceden a información clínica; el backend responde 403 aunque la interfaz oculte la opción.
- **Datos clínicos:** solo el rol Odontólogo tiene los permisos `clinical:*`. Cada apertura de una historia queda auditada (sin contenido). Las notas son de solo agregado: un trigger de la base rechaza modificarlas o borrarlas y se corrigen con una adenda vinculada a la original.
- **Dinero:** los importes se guardan con dos decimales y se calculan en centavos enteros. El saldo no se guarda: es siempre prestaciones vigentes menos pagos vigentes. Un pago se aplica a las prestaciones pendientes más antiguas (o a las elegidas) y lo que excede queda como saldo a favor. Las operaciones sobre la cuenta de un paciente se serializan con un bloqueo de su fila. Un trigger impide borrar prestaciones y pagos, y solo admite su anulación con motivo.
- No hay borrado físico: los usuarios y las sedes se desactivan; los datos clínicos y los pagos se corrigen con adenda o anulación.
