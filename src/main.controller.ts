import { Public } from '@common/decorator/public.decorator';
import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiExcludeController()
@Controller()
@Public()
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
