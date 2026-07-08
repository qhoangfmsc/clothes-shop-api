# BullMQ Queue & Bull Board

## Queue Name Convention

All queue names are centralized in a single enum at `src/common/enum/queue-name.enum.ts`:

```typescript
export enum QueueName {
  SOCKET = 'socket',
  TICKET_PIPELINE = 'ticket-pipeline',
}
```

**Rules:**
- Queue name **MUST** be added to `QueueName` enum before use
- Use `QueueName.XXX` everywhere — never hardcode queue name strings
- Processor, module, service, scheduler all import from `@common/enum/queue-name.enum`

## Module with Queue

When a module needs a BullMQ queue:

```typescript
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { QueueName } from '@common/enum/queue-name.enum';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.MY_QUEUE }),
    // Register with Bull Board dashboard
    BullBoardModule.forFeature({
      name: QueueName.MY_QUEUE,
      adapter: BullMQAdapter,
    }),
  ],
})
```

## Bull Board Dashboard

- **Root config**: Already configured in `core.module.ts` via `BullBoardModule.forRoot()`
- **Route**: `/admin/queues`
- **Auth**: Basic auth via `BULL_BOARD_USERNAME` / `BULL_BOARD_PASSWORD` env vars (no auth if not set)
- **Adapter**: `FastifyAdapter` from `@bull-board/fastify` (project uses Fastify)
- Each module that registers a queue **MUST** also register `BullBoardModule.forFeature()` so the queue appears in the dashboard

## Processor Convention

```typescript
import { QueueName } from '@common/enum/queue-name.enum';
import { Processor, WorkerHost } from '@nestjs/bullmq';

@Processor(QueueName.MY_QUEUE)
export class MyProcessor extends WorkerHost {
  async process(job: Job<MyJobData>): Promise<void> {
    // ...
  }
}
```

## Injecting Queue

```typescript
import { QueueName } from '@common/enum/queue-name.enum';
import { InjectQueue } from '@nestjs/bullmq';

constructor(
  @InjectQueue(QueueName.MY_QUEUE) private readonly myQueue: Queue,
) {}
```
