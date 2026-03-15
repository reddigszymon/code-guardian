# Code Guardian

A high-performance backend service wrapping the [Trivy](https://github.com/aquasecurity/trivy) security scanner, designed to process massive security reports under strict memory constraints (256MB RAM / 150MB V8 heap). Built with NestJS and Node.js streams to guarantee constant memory usage regardless of scan output size.

## Architecture

Code Guardian follows a **Controller → Service → Worker** layered architecture with strict separation of concerns enforced by NestJS dependency injection.

The core innovation is the **stream pipeline**: Trivy JSON output (which can be hundreds of megabytes for large repositories) is never loaded into memory. Instead, it is parsed token-by-token using `stream-json`, filtered for critical vulnerabilities on the fly, and discarded as it is consumed.

### Data Flow

```
POST /api/scan { repoUrl }
        │
        ▼
   ScanController ──── validates input (class-validator DTO)
        │
        ▼
   ScanStore.create() ──── creates record, status: Queued
        │
        ▼
   ScanWorker.processScan() ──── fire-and-forget (non-blocking)
        │
        ├── 1. Update status → Scanning
        ├── 2. Clone repo (simple-git, --depth 1)
        ├── 3. Run Trivy (child_process.execFile, 5min timeout)
        ├── 4. Stream-parse JSON ──── parser() → pick({filter:'Results'}) → streamArray()
        ├── 5. Filter CRITICAL vulnerabilities
        ├── 6. Update status → Finished (with vulns) or Failed (with error)
        └── 7. Cleanup temp dirs/files (always, via finally)
              │
              ▼
GET /api/scan/:scanId ──── poll for results
```

### Module Structure

```
src/
├── main.ts
├── app.module.ts
├── app.controller.ts                  # GET / health check
├── app.service.ts
└── scan/
    ├── scan.module.ts
    ├── controllers/
    │   └── scan.controller.ts         # POST /api/scan, GET /api/scan/:id
    ├── services/
    │   └── trivy.service.ts           # Git clone + Trivy execution + cleanup
    ├── workers/
    │   └── scan.worker.ts             # Orchestrates the full scan lifecycle
    ├── streams/
    │   └── vulnerability-filter.stream.ts  # Memory-safe JSON stream pipeline
    ├── store/
    │   └── scan.store.ts              # In-memory Map<id, ScanRecord>
    └── types/
        ├── scan.types.ts              # ScanStatus, ScanRecord, CriticalVulnerability
        └── create-scan.dto.ts         # Validated request DTO
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **NestJS** | Enforced separation of concerns via modules, DI for testability, built-in validation pipeline |
| **stream-json** | Memory-safe JSON parsing — no `fs.readFile`, no `JSON.parse` on scan results. Trivy output is consumed chunk-by-chunk with backpressure via `stream.pipeline` |
| **Fire-and-forget async** | `POST` returns `202 Accepted` immediately. Client polls `GET /api/scan/:id` for status transitions (`Queued → Scanning → Finished/Failed`). Prevents HTTP timeouts on large repos |
| **Cleanup in `finally`** | Temp directories (cloned repos, Trivy JSON output) are always deleted, even if the scan fails or status update throws |
| **Shallow clone** | `--depth 1` minimizes disk and network usage — Trivy only needs the current file tree |
| **Specific error handling** | Trivy not installed, timeout, disk full, auth required, invalid URL — each produces a descriptive error message stored on the scan record |

## How to Run

### Prerequisites

- Node.js 20+
- [Trivy](https://github.com/aquasecurity/trivy) installed and on PATH
- Git

### Local

```bash
npm install
npm run build
npm run start            # Standard start, port 3000
```

Memory-constrained mode (150MB V8 heap):

```bash
npm run start:constrained
```

### Docker

```bash
docker compose up --build
```

The Docker image uses a multi-stage build (`node:20-slim`), installs Trivy in the final stage, and runs with `--max-old-space-size=150`. The `docker-compose.yml` enforces a hard 200MB container memory limit via `mem_limit`.

## API Reference

### `POST /api/scan`

Queues a security scan for a public GitHub repository.

**Request:**

```json
{
  "repoUrl": "https://github.com/OWASP/NodeGoat"
}
```

**Response:** `202 Accepted`

```json
{
  "scanId": "a1b2c3d4-...",
  "status": "Queued"
}
```

**Validation errors:** `400 Bad Request` — repoUrl must be a non-empty, valid GitHub URL. Unknown fields are rejected.

### `GET /api/scan/:scanId`

Returns the current status of a scan. The `criticalVulnerabilities` field is only included when the scan has finished — it is omitted for `Queued`, `Scanning`, and `Failed` states.

**Response (in progress):** `200 OK`

```json
{
  "status": "Scanning"
}
```

**Response (finished):** `200 OK`

```json
{
  "status": "Finished",
  "criticalVulnerabilities": [
    {
      "vulnerabilityId": "CVE-2020-7610",
      "pkgName": "bson",
      "installedVersion": "1.0.9",
      "fixedVersion": "1.1.4",
      "title": "...",
      "description": "...",
      "severity": "CRITICAL",
      "target": "package-lock.json"
    }
  ]
}
```

**Not found:** `404` if scanId does not exist.

**Status transitions:** `Queued → Scanning → Finished` (success) or `Queued → Scanning → Failed` (error).

### `GET /`

Health check. Returns `{"status":"ok"}`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP listen port |
| `CORS_ORIGIN` | `*` | Allowed CORS origins (comma-separated, or `*` for all) |
| `SCAN_TIMEOUT_MS` | `300000` | Maximum time (ms) for a single Trivy scan before timeout |
| `MAX_CONCURRENT_SCANS` | `2` | Maximum scans running in parallel; excess scans are queued |
| `MAX_SCAN_RECORDS` | `500` | Maximum in-memory scan records before LRU eviction |
| `MAX_CRITICAL_VULNERABILITIES` | `1000` | Cap on critical vulnerabilities collected per scan |
| `TRIVY_BIN` | `trivy` | Path to the Trivy binary |

## Memory Safety

Trivy produces JSON output proportional to the number of dependencies and vulnerabilities in a project. For large monorepos, this can reach hundreds of megabytes — well beyond the 150MB heap limit.

Code Guardian solves this with a **streaming pipeline**:

1. `fs.createReadStream` reads the file in small chunks
2. `stream-json/parser` tokenizes JSON without buffering the full document
3. `stream-json/filters/Pick` selects only the `Results` array
4. `stream-json/streamers/StreamArray` emits one Result object at a time
5. A custom `Writable` filters for `Severity === 'CRITICAL'` and collects matches

Each Result is parsed, inspected, and garbage-collected individually. Peak memory usage stays constant regardless of file size.

### Verifying OOM safety

```bash
# Option 1: Node heap constrained to 150 MB
npm run build && npm run start:constrained

# Option 2: Docker container hard-limited to 200 MB
docker compose up --build

# Then trigger a scan on a large repo and confirm no OOM:
curl -X POST http://localhost:3000/api/scan \
  -H 'Content-Type: application/json' \
  -d '{"repoUrl":"https://github.com/nickvdyck/hello-docker"}'
# Poll GET /api/scan/<scanId> — the process should complete without crashing.
```

## Testing

Full end-to-end flow using curl:

```bash
# 1. Start the server
npm run start

# 2. Submit a scan
curl -X POST http://localhost:3000/api/scan \
  -H 'Content-Type: application/json' \
  -d '{"repoUrl":"https://github.com/OWASP/NodeGoat"}'
# → 202 {"scanId":"...","status":"Queued"}

# 3. Poll for results (repeat until status is Finished or Failed)
curl http://localhost:3000/api/scan/<scanId>
# → 200 {"status":"Scanning"}
# → 200 {"status":"Finished","criticalVulnerabilities":[...]}

# 4. Verify validation
curl -X POST http://localhost:3000/api/scan \
  -H 'Content-Type: application/json' \
  -d '{"repoUrl":"not-a-url"}'
# → 400 {"message":["repoUrl must be a GitHub repository URL","repoUrl must be a valid URL"],...}

# 5. Health check
curl http://localhost:3000/
# → {"status":"ok"}
```
