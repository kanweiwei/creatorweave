# Cross-Device Session Sync API

## Overview

This API enables cross-device synchronization of browser sessions using relay-server. Sessions are end-to-end encrypted - the server stores encrypted data without access to the plaintext content.

## Authentication

- **Optional Anonymous**: No authentication required for basic usage
- **Device Code**: Simple device identifier stored in localStorage
- All operations are scoped to the deviceId provided in requests

## Base URL

```
http://localhost:3001
```

## API Endpoints

### 1. Upload Session

Upload a session state to the server for cross-device sync.

**Endpoint**: `POST /api/session/upload`

**Request Body**:

```typescript
interface SessionUploadRequest {
  // Client-generated unique session identifier
  sessionId: string
  // Base64-encoded encrypted session data (E2E encrypted by client)
  encryptedData: string
  // Session metadata
  metadata: {
    name: string                    // Session display name
    deviceId: string                // Device identifier
    browserInfo: string            // User agent string
    version: string                // Protocol version
    createdAt: number              // Creation timestamp
    updatedAt: number              // Last update timestamp
  }
}
```

**Response**:

```typescript
interface SessionUploadResponse {
  success: boolean
  syncId: string                   // Unique sync identifier for retrieval
  expiresAt: string                // ISO timestamp when session expires
}
```

**Example**:

```bash
curl -X POST http://localhost:3001/api/session/upload \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "session-abc123",
    "encryptedData": "base64encodedencryptedstring...",
    "metadata": {
      "name": "Project Analysis Session",
      "deviceId": "device-123",
      "browserInfo": "Mozilla/5.0...",
      "version": "0.3.0",
      "createdAt": 1699000000000,
      "updatedAt": 1699000000000
    }
  }'
```

**Status Codes**:
- `200`: Success
- `400`: Invalid request (missing fields, invalid format)
- `413`: Payload too large (exceeds 10MB limit)
- `429`: Rate limit exceeded

---

### 2. Download Session

Download a previously uploaded session by its syncId.

**Endpoint**: `GET /api/session/download/:syncId`

**URL Parameters**:
- `syncId`: The unique sync identifier returned from upload

**Response**:

```typescript
interface SessionDownloadResponse {
  success: boolean
  sessionId: string
  encryptedData: string
  metadata: {
    name: string
    deviceId: string
    browserInfo: string
    version: string
    createdAt: number
    updatedAt: number
  }
  uploadedAt: string               // ISO timestamp of upload
  expiresAt: string               // ISO timestamp of expiration
}
```

**Example**:

```bash
curl http://localhost:3001/api/session/download/sync-xyz789
```

**Status Codes**:
- `200`: Success
- `404`: Session not found or expired
- `410`: Session expired

---

### 3. List Sessions

List all sessions available for the requesting device.

**Endpoint**: `GET /api/sessions`

**Query Parameters**:
- `deviceId`: (Optional) Filter by deviceId
- `limit`: (Optional) Maximum number of results (default: 50, max: 100)
- `offset`: (Optional) Pagination offset (default: 0)

**Response**:

```typescript
interface SessionListResponse {
  success: boolean
  sessions: Array<{
    syncId: string
    sessionId: string
    title: string                // Derived from metadata.name
    deviceId: string
    deviceInfo: string           // Derived from metadata.browserInfo
    createdAt: number
    updatedAt: number
    uploadedAt: string
    expiresAt: string
    size: number                 // Size in bytes
  }>
  total: number                  // Total sessions matching filter
  hasMore: boolean
}
```

**Example**:

```bash
curl "http://localhost:3001/api/sessions?limit=10&offset=0"
```

---

### 4. Delete Session

Delete a session by its syncId.

**Endpoint**: `DELETE /api/session/:syncId`

**URL Parameters**:
- `syncId`: The unique sync identifier

**Response**:

```typescript
interface SessionDeleteResponse {
  success: boolean
  message?: string               // Additional information
}
```

**Example**:

```bash
curl -X DELETE http://localhost:3001/api/session/sync-xyz789
```

**Status Codes**:
- `200`: Successfully deleted
- `404`: Session not found

---

## Encryption

### End-to-End Encryption Flow

1. **Client generates** a random AES-256 key
2. **Client encrypts** session data with AES-256-GCM
3. **Client encrypts** the AES key with the recipient's RSA public key
4. **Client uploads** encrypted data + encrypted key to server
5. **Server stores** encrypted data without ever seeing plaintext
6. **Recipient downloads** encrypted data + encrypted key
7. **Recipient decrypts** AES key with their RSA private key
8. **Recipient decrypts** session data with decrypted AES key

### Encrypted Payload Format

```typescript
interface EncryptedPayload {
  // Base64-encoded encrypted data
  ciphertext: string
  // Initialization vector (12 bytes, base64-encoded)
  iv: string
  // Authentication tag (16 bytes, base64-encoded)
  tag: string
  // Encrypted AES key (RSA-OAEP encrypted, base64-encoded)
  encryptedKey: string
}
```

---

## Storage Limits

| Limit Type | Value | Description |
|------------|-------|-------------|
| Maximum payload size | 10 MB | Per session upload |
| Maximum sessions | 100 | Per device |
| Retention period | 30 days | From last access |
| Maximum metadata | 1 KB | Per session |

---

## Cleanup Policy

- Sessions are automatically deleted after 30 days of no access
- Manual deletion is immediate
- Expired sessions return `410 Gone` status
- A background job runs hourly to clean expired sessions

---

## Rate Limits

- **Upload**: 10 requests per minute per device
- **Download**: 60 requests per minute per device
- **List**: 30 requests per minute per device
- **Delete**: 20 requests per minute per device

---

## Error Responses

All endpoints return errors in the following format:

```typescript
interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: any
  }
}
```

**Common Error Codes**:

| Code | HTTP Status | Description |
|------|-------------|-------------|
| INVALID_REQUEST | 400 | Malformed request body |
| PAYLOAD_TOO_LARGE | 413 | Data exceeds 10MB limit |
| NOT_FOUND | 404 | Session does not exist |
| GONE | 410 | Session has expired |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server-side error |

---

## Client Integration

### TypeScript Types

```typescript
// Request/Response types for client use
export interface SessionSyncAPI {
  upload(request: SessionUploadRequest): Promise<SessionUploadResponse>
  download(syncId: string): Promise<SessionDownloadResponse>
  list(params?: SessionListParams): Promise<SessionListResponse>
  delete(syncId: string): Promise<SessionDeleteResponse>
}

export interface SessionUploadRequest {
  sessionId: string
  encryptedData: string
  metadata: SessionMetadata
}

export interface SessionListParams {
  deviceId?: string
  limit?: number
  offset?: number
}
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-11 | Initial API design |

