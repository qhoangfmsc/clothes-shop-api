# Project Structure

```
src/
├── common/                  # Shared utilities (project-wide)
│   ├── base/                # Base classes, typeorm-list-query util
│   ├── decorator/           # Custom decorators
│   ├── dto/                 # Shared DTOs (FindBaseDto, etc.)
│   ├── exceptions/          # AppException, error codes
│   ├── filter/              # Exception filters
│   ├── guards/              # AuthGuard, RolesGuard, PermissionsGuard
│   ├── middleware/           # Global middleware
│   ├── types/               # Shared type definitions
│   ├── utils/               # Utility functions
│   └── validator/           # Validation helpers
├── core/                    # Core infrastructure (global modules)
│   ├── auth/                # Authentication (JWT Bearer)
│   │   ├── entities/        # TypeORM entities (User, UserRole)
│   │   ├── dtos/            # Auth DTOs (login, register)
│   │   └── decorators/      # Auth decorators
│   ├── socket/              # WebSocket (Socket.IO + Redis adapter)
│   └── swagger/             # Swagger config
├── modules/                 # Feature modules
│   └── <feature>/           # Each feature is a self-contained module
│       ├── entities/
│       └── dtos/
├── migrations/              # TypeORM migration files
├── main.ts                  # Bootstrap (Fastify adapter)
├── main.module.ts           # Root module
└── main.controller.ts       # Health check
```

## Key Rules

- **`core/`** = infrastructure, registered as `@Global()` modules. Rarely touched.
- **`common/`** = shared utilities, validators, base DTOs, guards. Used across all feature modules.
- **`modules/`** = feature modules. Each module is self-contained with its own controller, service, `dtos/` folder (chứa `<feature>.dto.ts` và `<feature>_response.dto.ts`), entities.
- **Path aliases**: Use `@common/*` for `src/common/*`. Use `src/` prefix for other absolute imports.
