# Import Convention

## KHÔNG dùng barrel exports (index.ts)

- **KHÔNG tạo file `index.ts`** để re-export từ các file khác
- Mỗi file tự export trực tiếp các class/function/type của nó
- Các module khác import trực tiếp từ file cụ thể

### ❌ Sai

```typescript
// ❌ KHÔNG tạo entities/index.ts
export * from './user.entity';
export * from './role.entity';

// ❌ KHÔNG import qua barrel
import { User, Role } from './entities';
```

### ✅ Đúng

```typescript
// ✅ Import trực tiếp từ file cụ thể
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
```

## Path Aliases

- `@common/*` → `src/common/*` — dùng cho shared utilities, guards, DTOs
- Các import khác dùng relative path hoặc `src/` prefix

```typescript
// ✅ Guard imports
import { AuthGuard } from '@common/guards/auth.guard';
import { ApiKeyGuard } from '@common/guards/api-key.guard';

// ✅ Common utilities
import { FindBaseSchema } from '@common/dto/find-base.dto';
import { AppException } from '@common/exceptions/app.exception';

// ✅ Core auth (dùng relative hoặc src/ prefix)
import { User } from 'src/core/auth/entities/user.entity';
import { AuthService } from 'src/core/auth/auth.service';
```
