# Error Handling

## NestJS Built-in Exceptions (cho simple cases)

```typescript
import { NotFoundException, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';

throw new NotFoundException('Resource not found');
throw new ForbiddenException('Access denied');
throw new UnauthorizedException('Invalid credentials');
```

## AppException (cho custom error codes)

Dùng khi cần trả về error code cụ thể cho frontend:

```typescript
import { AppException, throwAppError } from '@common/exceptions/app.exception';

// Cách 1: throw trực tiếp
throw new AppException(ErrorCode.INVALID_INPUT, 'Custom message');

// Cách 2: helper function
throwAppError(ErrorCode.INVALID_INPUT, 'Custom message');
```

Error codes được định nghĩa trong `src/common/exceptions/error-codes.ts`.
