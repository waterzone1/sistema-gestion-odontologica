# Sistema de Gestión Odontológica

Prototipo funcional de un sistema de gestión para consultorios odontológicos pequeños y medianos de Argentina: pacientes, agenda, historia clínica, odontograma, cobros, coberturas, auditoría y backups.

Estado: en desarrollo. Hoy incluye la base técnica (backend, frontend, base de datos, proxy con TLS, CI y documentación de diseño).

## Requisitos

- Docker con Compose.
- Node.js 22 o superior (solo para desarrollo fuera de Docker).

## Levantar todo con Docker

```bash
cp .env.example .env
# cambiar POSTGRES_PASSWORD (y DATABASE_URL para que coincida)
docker compose up -d --build
```

Abrir <https://localhost>. El proxy usa una CA interna, por eso el navegador va a advertir el certificado hasta que se confíe en ella (ver [deployment](docs/deployment.md)).

- Estado del backend: <https://localhost/api/health>
- Documentación de la API: <https://localhost/api/docs>

## Desarrollo

Base de datos en Docker, backend y frontend en la máquina:

```bash
docker compose up -d postgres

cd backend
npm ci
npm run db:deploy
npm run dev            # http://localhost:4000

cd ../frontend
npm ci
npm run dev            # http://localhost:3000
```

En desarrollo, Next reenvía `/api` al backend.

### Calidad

Desde `backend/` y `frontend/`:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Los tests de integración del backend usan la base indicada en `DATABASE_URL`.

### API

- `npm run openapi:export` (backend) regenera `docs/openapi.yaml`.
- `npm run api:types` (frontend) regenera los tipos a partir de ese documento.

La CI verifica que ambos estén al día.

## Estructura

```text
backend/    API REST (Node.js, Express, Prisma)
frontend/   interfaz web (Next.js)
infra/      configuración del proxy
docs/       arquitectura, C4, modelo de datos, OpenAPI, deployment
```

## Licencia

MIT. Ver [LICENSE](LICENSE).
