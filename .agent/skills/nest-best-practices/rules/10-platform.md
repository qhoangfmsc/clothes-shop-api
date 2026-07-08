# Platform & Tooling

- **HTTP Framework**: Fastify (NOT Express) — registered via `NestFastifyApplication`
- **Validation Pipe**: `ValidationPipe` (global, set in `main.ts` with transform and whitelist)
- Do NOT use `nestjs-zod` or `zod`
- **Package manager**: `yarn` (NOT npm)
- **ORM**: TypeORM with Repository pattern (NOT Drizzle for application code)
- **Authentication**: JWT Bearer (stateless, token-based via `@nestjs/jwt`)
