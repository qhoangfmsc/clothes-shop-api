import { Public } from '@common/decorator/public.decorator';
import { SkipRateLimit } from '@common/decorator/rate-limit.decorator';
import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiExcludeController()
@Controller()
@Public()
@SkipRateLimit()
export class MainController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  getHello(): string {
    return 'Clothes Shop API is running';
  }

  @Get('health')
  async health() {
    try {
      await this.dataSource.query('SELECT 1');
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        db: 'connected',
        // Render đặt biến này; kiểm tra sau deploy dùng nó để biết bản mới đã lên chưa
        commit: process.env.RENDER_GIT_COMMIT ?? null,
      };
    } catch {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        db: 'disconnected',
      };
    }
  }
}
