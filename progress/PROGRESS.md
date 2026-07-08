# Clothes Shop API — Progress

> Last updated: 2026-07-08

---

## Overall Status

```
Project Setup     ████████████████████  100%
Core Modules      ████████████████████  100%
Simple Modules    ████████████████████  100%
DB + Seed Data    ████████████████████  100%
FE Integration    ░░░░░░░░░░░░░░░░░░░░   0% (cần test với FE)
```

---

## ✅ Completed

### Phase 1: Project Cleanup (from marops-api)
- [x] Deleted 12 marops business modules
- [x] Deleted old migrations (marops schema)
- [x] Removed Redis, BullMQ, WebSocket, Auth (Vietnix SSO) dependencies
- [x] Stripped package.json from 50+ deps to ~15 essential deps
- [x] Updated core.module.ts (ConfigModule + TypeORM only)
- [x] Simplified main.ts (port 4000, no Redis adapter)
- [x] Updated Swagger config for Clothes Shop
- [x] Created .env.example, .gitignore
- [x] Build passes ✅

### Phase 2: Core Modules
- [x] **Product module** — entity, service, controller
  - `GET /api/products` — filter by category, subcategory, badge, sort, limit
  - `GET /api/products/:id` — detail + 4 related products
- [x] **Category module** — category + subcategory + UI config entities
  - `GET /api/categories` — all categories + uiConfigs map
  - `GET /api/categories?slug=tops` — single category + uiConfig
- [x] **Collection module** — entity with JSONB productIds
  - `GET /api/collections` — all collections
  - `GET /api/collections?slug=...` — single collection + resolved products

### Phase 3: Simple Modules
- [x] **Review module** — entity + service (DB-backed)
  - `GET /api/reviews/:productId`
- [x] **Shipping module** — static JSON controller
  - `GET /api/shipping`
- [x] **Size Guide module** — static JSON controller
  - `GET /api/size-guides/:category` (tops, skirts, bags, jewelry)

### Database
- [x] InitSchema migration — 7 tables (users, products, categories, subcategories, category_ui_configs, collections, reviews)
- [x] SeedData migration — 32 products, 4 categories, 21 subcategories, 4 UI configs, 7 collections, 6 sample reviews
- [x] All data matches FE mock data exactly

---

## 🔲 Pending

### FE Integration
- [ ] Test: set `NEXT_PUBLIC_API_URL=http://localhost:7000` in clothes-shop
- [ ] Verify all FE pages render correctly with real API
- [ ] Remove FE mock API routes once confirmed

### Future Enhancements
- [ ] Auth module (Google Sign-In / JWT)
- [ ] Cart & Order modules
- [ ] Admin CRUD endpoints
- [ ] Image upload (S3/local)
- [ ] Search with full-text PostgreSQL

---

## API Endpoints

| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/products` | ✅ Done |
| GET | `/api/products/:id` | ✅ Done |
| GET | `/api/categories` | ✅ Done |
| GET | `/api/categories?slug=` | ✅ Done |
| GET | `/api/collections` | ✅ Done |
| GET | `/api/collections?slug=` | ✅ Done |
| GET | `/api/reviews/:productId` | ✅ Done |
| GET | `/api/shipping` | ✅ Done |
| GET | `/api/size-guides/:category` | ✅ Done |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | NestJS 11 |
| Language | TypeScript 5 |
| Database | PostgreSQL + TypeORM |
| Docs | Swagger |
| Linter | Biome |
| Build | SWC (via NestJS CLI) |
| Port | 7000 (default) |
