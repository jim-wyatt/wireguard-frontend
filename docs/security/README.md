# Security Baseline (2026-04-04)

This folder contains a point-in-time dependency and container security baseline generated after upgrading to pinned, digest-locked images and latest application dependencies.

## What was hardened

- Frontend npm dependencies upgraded to latest major/stable lines (React 19, MUI 7, Vite 8, Vitest 4, etc.).
- Backend Python requirements remain pinned at latest stable releases available.
- Runtime images pinned by digest in compose files:
  - `caddy:2.11.2-alpine@sha256:a1b7e624f860619cea121bdbc5dec2e112401666298c6507c6793b0a3ee6fc8e`
  - `postgres:18.3-alpine3.23@sha256:4da1a4828be12604092fa55311276f08f9224a74a62dcb4708bd7439e2a03911`
- Containerfile base images pinned by digest:
  - Backend: `python:3.12.13-slim-trixie`
  - Frontend builder (LTS): `node:22.22.2-alpine3.23@sha256:1e8b5d68cac394f76c931b266fe5c224c3fe4cdbc33131e064c83b88235fe77e`
  - Frontend runtime: `nginx:1.28.3-alpine3.23@sha256:0dcc88822d45581e65ae329f8be769762bf628d3b2bb7d2a077d4aa5c98b30e3`
- Added strict `.dockerignore` files for backend/frontend to avoid leaking local environments and reduce image size.

## Vulnerability reports (Trivy)

High/Critical baseline reports:

- `trivy-caddy.txt`
- `trivy-postgres.txt`
- `trivy-backend.txt`

Notes:

- Caddy/Postgres reports include findings marked `Status: fixed` (available upstream package fixes).
- Backend report reflects Debian 13 (trixie) base + pinned Python packages in image.

## SBOM artifacts (CycloneDX)

- `sbom-caddy.cdx.json`
- `sbom-postgres.cdx.json`
- `sbom-backend.cdx.json`

## Regeneration commands

```bash
# Vulnerability reports
sudo podman run --rm docker.io/aquasec/trivy:0.67.2 image --format table --severity HIGH,CRITICAL <image-ref>

# SBOM reports
sudo podman run --rm docker.io/aquasec/trivy:0.67.2 image --format cyclonedx <image-ref>
```

For local Podman-built images, export to tar first:

```bash
sudo podman save -o docs/security/wg_backend_latest.tar localhost/wg_backend:latest
sudo podman run --rm -v "$PWD/docs/security:/reports" docker.io/aquasec/trivy:0.67.2 image --input /reports/wg_backend_latest.tar --format table --severity HIGH,CRITICAL
```
