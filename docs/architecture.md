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

## Seguridad (principios)

- Contraseñas con Argon2id; sesiones en el servidor, guardadas en PostgreSQL, con cookie `HttpOnly`, `Secure` y `SameSite`. Sin JWT.
- La autorización se valida siempre en el backend: sesión, organización, rol y sede.
- Los roles Administrador y Recepcionista no acceden a información clínica; el backend responde 403 aunque la interfaz oculte la opción.
- No hay borrado físico de datos clínicos ni de pagos: se archivan, anulan o corrigen con adenda.
