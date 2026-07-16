# Tiles Stock Manager

A daily stock management system for tiles depots. Staff upload PDF stock reports from each depot, the app automatically extracts all tile stock data, and provides a searchable interface to check inventory.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, served at /api)
- `pnpm --filter @workspace/tiles-stock run dev` — run the frontend (port 19720, served at /)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Wouter + TanStack Query
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (zod/v4), drizzle-zod
- PDF Parsing: PyMuPDF (via Python subprocess) — custom positional block parser
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for API contract
- `lib/db/src/schema/` — Drizzle schema (depots, uploads, stock_items)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/tiles-stock/src/pages/` — React pages (dashboard, stock, upload, depots)

## Architecture decisions

- PDF parsing uses PyMuPDF called via `child_process.exec` from Node.js — avoids native Node.js PDF complexity
- Parser uses positional block extraction (sorted by y,x) to handle varied PDF layouts across depots
- Uploading a new PDF **replaces** all existing stock for that depot (latest upload = current truth)
- Background PDF processing — POST /uploads responds immediately with status "processing", frontend polls GET /uploads/:id until done/failed
- Depots are pre-seeded (CHEMMANIYODE, KOTTAKKAL, PATHIRIPALA, TRUSTO GALLERIA); new depots can be added via the Depots page or inline during upload

## Product

- **Dashboard** — depot cards with stock counts and last upload date
- **Stock Search** — full-text search + filter by depot/brand/size/finish
- **Upload Report** — PDF drop zone per depot with live processing status
- **Depots** — manage depot list

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing `lib/db/src/schema/`, run `pnpm run typecheck:libs` before checking API server, or exports will appear missing
- PyMuPDF must be installed (`pymupdf` Python package) — already installed via `uv`
- The Python parser is embedded as a template string in `artifacts/api-server/src/routes/uploads.ts` and written to a temp file per request
- Brand list in the parser (BRANDS array in uploads.ts) may need expanding if new brands are added

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
