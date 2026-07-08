# Logging

**KHÔNG dùng** `Logger` của NestJS. Dùng `LoggerService` global:

```typescript
import { Injectable } from '@nestjs/common';
import { LoggerService } from 'src/core/logger/logger.service';

@Injectable()
export class FeatureService {
  constructor(private readonly loggerService: LoggerService) {}

  async doSomething() {
    try {
      // business logic
    } catch (error) {
      await this.loggerService.logError(error, {
        userId: 123,
        action: 'do_something',
      });
      throw error;
    }
  }

  async debugSomething() {
    await this.loggerService.logDebug('Something happened', {
      userId: 123,
      detail: 'extra info',
    });
  }
}
```
