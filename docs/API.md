# API Documentation

## Base URLs

- Direct backend: http://localhost:8000
- Through Caddy (production): https://<DOMAIN>

All application routes are under `/api` except root and health endpoints.

## OpenAPI

When enabled, interactive docs are available at:

- `/docs`
- `/openapi.json`

## Authentication Model

Credentials can be provided via either header:

- `Authorization: Bearer <token>`
- `X-API-Key: <token>`

Supported token modes:

- Legacy single token: `API_AUTH_TOKEN`
- Scoped token grants: `API_AUTH_TOKENS_JSON`

Roles:

- `public`: read-only authenticated access
- `writer`: mutating access

## Route Groups

### Public (No Auth Required)

- `GET /`
- `GET /health`
- `GET /api/nodes/stats`
- `GET /api/logs/stream`
- `GET /api/logs/caddy/access/stream`
- `GET /api/metrics/summary`
- `GET /api/attestation/summary`

### Auth Required (Public or Writer Role)

- `GET /api/nodes`
- `GET /api/nodes/connected`
- `GET /api/nodes/{client_id}`
- `GET /api/debug/top/snapshot`
- `GET /api/debug/btop/snapshot`

### Writer Role Required

- `POST /api/nodes`
- `GET /api/nodes/{client_id}/config`
- `PATCH /api/nodes/{client_id}/toggle`
- `DELETE /api/nodes/{client_id}`

## Legacy Compatibility Routes

`/api/clients*` routes are supported and redirect to canonical `/api/nodes*` routes.

## Node Endpoints

### Create Node

- `POST /api/nodes`
- Body:

```json
{
  "email": "user@example.com",
  "name": "Optional Name"
}
```

### List Nodes

- `GET /api/nodes?skip=0&limit=100&active_only=false`

### Node Stats

- `GET /api/nodes/stats`

### Connected Nodes

- `GET /api/nodes/connected`

### Node Detail

- `GET /api/nodes/{client_id}`

### Node Config + QR

- `GET /api/nodes/{client_id}/config`

### Toggle Node Active State

- `PATCH /api/nodes/{client_id}/toggle`

### Delete Node

- `DELETE /api/nodes/{client_id}`

## Observability Endpoints

- `GET /api/metrics/summary`
- `GET /api/attestation/summary`
- `GET /api/logs/stream`
- `GET /api/logs/caddy/access/stream`
- `GET /api/debug/top/snapshot`
- `GET /api/debug/btop/snapshot`

## Error Shape

Errors follow FastAPI conventions:

```json
{
  "detail": "Error message"
}
```

Common statuses:

- `400` validation/business rule error
- `401` missing/invalid credentials
- `403` insufficient role
- `404` resource not found
- `429` auth failure lockout or endpoint rate-limit
- `500` internal server error

## Notes for UI Consumers

- Public dashboard-style endpoints can be called without credentials.
- Mutating routes require writer credentials.
- Admin browser sessions should inject token at runtime, not build time.
