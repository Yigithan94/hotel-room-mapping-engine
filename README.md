# Hotel Room Mapping Engine

## Overview

A production-grade Hotel Room Mapping Engine that collects room inventory from multiple suppliers, automatically deduplicates and maps rooms using AI/ML, and serves unified room data through a sales API. Includes a full admin dashboard for reviewing and managing mappings.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui + Recharts

## Architecture

### 5 Layers

1. **Supplier Integration** — 3 mock suppliers (BookingBridge, TravelNex Pro, HotelConnect API) with realistic room data in different naming formats
2. **AI/ML Mapping Engine** — Multi-feature scoring system combining:
   - Semantic similarity (token-based + Levenshtein)
   - Fuzzy string matching (token set ratio)
   - Bed configuration matching
   - Area tolerance (±10%)
   - Amenity overlap ratio
3. **Master Room Registry** — Canonical room deduplication with confidence scores
4. **Review Interface** — Admin dashboard with side-by-side comparison, confidence radar charts, and approve/reject/correct actions
5. **Sales API** — Unified room endpoint with pricing from all suppliers

### Decision Thresholds
- score >= 0.92 → auto_approved
- 0.75 <= score < 0.92 → pending_review  
- score < 0.75 → new master room created

## Database Schema

- `hotels` — Hotel registry
- `suppliers` — Supplier connector configs
- `master_rooms` — Canonical room records
- `supplier_rooms` — Raw supplier room data
- `room_mappings` — Mapping results with confidence scores and feature breakdown
- `mapping_feedback` — Human review decisions

## Key Routes

**API Server** (`/api`):
- `GET /api/v1/hotels` — all hotels with stats
- `GET /api/v1/hotels/:id/rooms` — unified rooms with all supplier prices
- `GET /api/v1/rooms` — list master rooms (with filter/pagination)
- `GET /api/v1/rooms/:id` — master room detail with all mappings
- `GET /api/v1/rooms/:id/prices` — supplier price comparison
- `GET /api/v1/mappings` — list mappings (filterable by status)
- `POST /api/v1/mappings/:id/review` — approve/reject/correct
- `POST /api/v1/mappings/batch-approve` — batch operations
- `POST /api/v1/mapping/trigger` — re-run mapping pipeline
- `GET /api/v1/suppliers` — supplier list
- `GET /api/v1/supplier-rooms` — raw supplier rooms
- `GET /api/v1/stats/dashboard` — dashboard statistics
- `GET /api/v1/stats/mapping-accuracy` — accuracy over time

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec (must fix `lib/api-zod/src/index.ts` after running — set to `export * from "./generated/api";` only)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

- **hotel-mapping-admin** — React + Vite admin dashboard at `/`
- **api-server** — Express API server at `/api`

## Seed Data

Two hotels with ~25 supplier rooms across 3 suppliers. Rooms intentionally have different naming conventions:
- Supplier A: "Deluxe King Room Sea View"
- Supplier B: "DLX KNG - Ocean Front"  
- Supplier C: "Superior King Seaview"

The mapping engine identifies these as related and creates appropriate master room mappings.
