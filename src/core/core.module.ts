import { Global, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InjectDataSource, TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        host: configService.get<string>('POSTGRES_HOST', '127.0.0.1'),
        port: Number(configService.get('POSTGRES_PORT', 5432)),
        username: configService.get<string>('POSTGRES_USERNAME', 'pguser'),
        password: configService.get<string>('POSTGRES_PASSWORD', ''),
        database: configService.get<string>('POSTGRES_DATABASE', 'clothes-shop'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
  ],
  providers: [],
  exports: [],
})
export class CoreModule implements OnModuleInit {
  private readonly logger = new Logger(CoreModule.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.logDbStats();
  }

  private async logDbStats(): Promise<void> {
    try {
      const result: Array<{ table_name: string }> = await this.dataSource.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);

      if (result.length === 0) {
        this.logger.warn('No tables found — migrations may not have run yet');
        return;
      }

      const rowCounts = await Promise.all(
        result.map(async ({ table_name }) => {
          const [{ count }] = await this.dataSource.query(`SELECT COUNT(*) as count FROM "${table_name}"`);
          return { table: table_name, rows: Number(count) };
        }),
      );

      this.logger.log(`DB has ${result.length} table(s):`);
      for (const { table, rows } of rowCounts) {
        this.logger.log(`  ${table}: ${rows} row(s)`);
      }
    } catch (err) {
      this.logger.error('Failed to read DB stats', err);
    }
  }
}
