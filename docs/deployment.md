# Deployment

Guía para levantar el sistema con Docker Compose en un servidor Ubuntu. Está en construcción y se completa a medida que se agregan backups, restauración y hardening.

## Requisitos

- Ubuntu Server con Docker Engine y el plugin de Compose.
- Puertos 80 y 443 libres (configurables con `HTTP_PORT` y `HTTPS_PORT`).
- Un directorio para los backups en un disco distinto al de los datos (a partir del milestone de backups).

## Puesta en marcha

```bash
cp .env.example .env
# editar .env: cambiar POSTGRES_PASSWORD y, si corresponde, SITE_ADDRESS
docker compose up -d --build
```

Servicios: `postgres`, `backend` (aplica las migraciones al iniciar), `frontend` y `proxy` (Caddy).

Verificación:

```bash
curl -k https://localhost/api/health
```

## HTTPS en la red local

Caddy emite los certificados con su CA interna (`tls internal`). Cada dispositivo que acceda debe confiar en el certificado raíz de esa CA:

```bash
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

Ese archivo se instala como autoridad certificadora de confianza en cada equipo, tablet o celular. Para acceder por un nombre o IP distintos de `localhost`, definir `SITE_ADDRESS` en `.env`.

## Datos y volúmenes

| Volumen | Contenido |
|---|---|
| `pgdata` | Base de datos PostgreSQL |
| `caddy_data` | Certificados y CA interna del proxy |

## Pendiente de documentar

- Backups automáticos, retención y restauración.
- Almacenamiento de archivos clínicos.
- Cifrado del disco del servidor (control de infraestructura, no de la aplicación).
- Acceso remoto por WireGuard (opcional).
