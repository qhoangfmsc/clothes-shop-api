# Clothes Shop API

> **Ori Baebi** — Backend API for the fashion e-commerce store.

NestJS backend serving the [clothes-shop](../clothes-shop) Next.js frontend.

## Quick Start

```bash
# 1. Install dependencies
yarn install

# 2. Copy environment variables
cp .env.example .env

# 3. Create PostgreSQL database
createdb "clothes-shop"

# 4. Run migrations + seed data
yarn migration:run

# 5. Start dev server
yarn dev
```

API runs at `http://localhost:7000`. Swagger docs at `http://localhost:7000/api-docs`.

## Connect to Frontend

In `clothes-shop/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:7000
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products (filter: `?category=`, `?subcategory=`, `?badge=`, `?sort=`, `?limit=`) |
| GET | `/api/products/:id` | Product detail + related products |
| GET | `/api/categories` | All categories + UI configs |
| GET | `/api/categories?slug=tops` | Single category + UI config |
| GET | `/api/collections` | All collections |
| GET | `/api/collections?slug=summer-reverie` | Single collection + resolved products |
| GET | `/api/reviews/:productId` | Product reviews |
| GET | `/api/shipping` | Shipping methods + return policy |
| GET | `/api/size-guides/:category` | Size guide by category |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | NestJS 11 |
| Language | TypeScript |
| Database | PostgreSQL + TypeORM |
| Docs | Swagger (auto-generated) |
| Linter | Biome |

## Project Structure

```
src/
├── common/              # Shared utilities
│   ├── base/            # BaseEntity, Paging, list query util
│   ├── decorator/       # API endpoint decorator
│   ├── dto/             # Base pagination DTO
│   ├── exceptions/      # AppException + error codes
│   ├── filter/          # Global exception filter
│   ├── types/           # Common types
│   ├── utils/           # Helper functions
│   └── validator/       # Validation utils
├── core/                # App core setup
│   ├── core.module.ts   # ConfigModule + TypeORM
│   └── swagger/         # Swagger configuration
├── modules/             # Feature modules
│   ├── product/         # Products CRUD
│   ├── category/        # Categories + subcategories + UI config
│   ├── collection/      # Curated collections
│   ├── review/          # Product reviews
│   ├── shipping/        # Static shipping info
│   └── size-guide/      # Static size guides
├── migrations/          # TypeORM migrations
├── main.ts              # Bootstrap
├── main.module.ts       # Root module
└── main.controller.ts   # Health check
```

## Scripts

```bash
yarn dev              # Start dev server (watch mode)
yarn build            # Build for production
yarn start            # Start production build
yarn migration:run    # Run pending migrations
yarn migration:revert # Revert last migration
yarn lint             # Run Biome linter
yarn lint:fix         # Auto-fix lint issues
```
