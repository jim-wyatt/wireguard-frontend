# API Documentation

## Base URL

```
http://localhost:8000/api
```

## Endpoints

### Health Check

#### GET /health
Check if the API is running.

**Response:**
```json
{
  "status": "healthy"
}
```

---

### Client Management

#### POST /api/nodes
Create a new WireGuard client.

**Request Body:**
```json
{
  "email": "user@example.com",
  "name": "John Doe"  // optional
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "ip_address": "10.0.0.2",
  "public_key": "...",
  "is_active": true,
  "created_at": "2024-03-07T10:00:00Z",
  "last_handshake": null,
  "config_downloaded": false
}
```

**Error Responses:**
- `400`: Email already registered
- `500`: Failed to generate keys or allocate IP

---

#### GET /api/nodes
List all clients.

**Query Parameters:**
- `skip` (int): Number of records to skip (default: 0)
- `limit` (int): Maximum number of records (default: 100)
- `active_only` (bool): Only return active clients (default: false)

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "ip_address": "10.0.0.2",
    "public_key": "...",
    "is_active": true,
    "created_at": "2024-03-07T10:00:00Z",
    "last_handshake": "2024-03-07T11:30:00Z",
    "config_downloaded": true
  }
]
```

---

#### GET /api/nodes/stats
Get client statistics.

**Response:** `200 OK`
```json
{
  "total_clients": 10,
  "active_clients": 8,
  "connected_clients": 3
}
```

---

#### GET /api/nodes/connected
Get list of currently connected clients.

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "email": "user@example.com",
    "name": "John Doe",
    "ip_address": "10.0.0.2",
    "last_handshake": "2024-03-07T11:30:00Z",
    "transfer_rx": 1048576,
    "transfer_tx": 2097152
  }
]
```

---

#### GET /api/nodes/{client_id}
Get details of a specific client.

**Response:** `200 OK`
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "ip_address": "10.0.0.2",
  "public_key": "...",
  "is_active": true,
  "created_at": "2024-03-07T10:00:00Z",
  "last_handshake": "2024-03-07T11:30:00Z",
  "config_downloaded": true
}
```

**Error Responses:**
- `404`: Client not found

---

#### GET /api/nodes/{client_id}/config
Get client configuration file and QR code.

**Response:** `200 OK`
```json
{
  "config": "[Interface]\nPrivateKey = ...\n...",
  "qr_code": "data:image/png;base64,..."
}
```

**Error Responses:**
- `404`: Client not found

---

#### PATCH /api/nodes/{client_id}/toggle
Toggle client active status (enable/disable).

**Response:** `200 OK`
```json
{
  "id": 1,
  "email": "user@example.com",
  "name": "John Doe",
  "ip_address": "10.0.0.2",
  "public_key": "...",
  "is_active": false,
  "created_at": "2024-03-07T10:00:00Z",
  "last_handshake": "2024-03-07T11:30:00Z",
  "config_downloaded": true
}
```

**Error Responses:**
- `404`: Client not found

---

#### DELETE /api/nodes/{client_id}
Delete a client.

**Response:** `204 No Content`

**Error Responses:**
- `404`: Client not found

---

## Data Models

### Client

```typescript
{
  id: number;
  email: string;
  name: string | null;
  ip_address: string;
  public_key: string;
  is_active: boolean;
  created_at: string; // ISO 8601 datetime
  last_handshake: string | null; // ISO 8601 datetime
  config_downloaded: boolean;
}
```

### ClientCreate

```typescript
{
  email: string; // valid email address
  name?: string; // optional
}
```

### ClientStats

```typescript
{
  total_clients: number;
  active_clients: number;
  connected_clients: number;
}
```

### ClientConnected

```typescript
{
  id: number;
  email: string;
  name: string | null;
  ip_address: string;
  last_handshake: string; // ISO 8601 datetime
  transfer_rx: number; // bytes received
  transfer_tx: number; // bytes transmitted
}
```

---

## Error Handling

All errors follow this format:

```json
{
  "detail": "Error message description"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `204`: No Content (successful deletion)
- `400`: Bad Request (validation error)
- `404`: Not Found
- `500`: Internal Server Error

---

## Rate Limiting

Consider implementing rate limiting in production to prevent abuse, especially for client creation endpoints.

## Authentication

The current version does not include authentication. For production use, implement:
- JWT tokens
- API keys
- OAuth2

Add authentication middleware to protect endpoints.
