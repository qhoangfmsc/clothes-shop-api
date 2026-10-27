import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { MIGRATION_LOCK_KEY, runMigrationsWithLock } from '../../../scripts/migrate';

/** Khoá khi chạy migration (spec common/0016): DB tạm trống, nhiều runner đồng thời. DB tạm kết thúc `_test` để qua chốt chặn an toàn. */
const MIGRATIONS_DIR = resolve(__dirname, '../../../src/migrations');
const MIGRATION_COUNT = readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.ts')).length;
const SCRATCH_DB = 'clothes_shop_lock_test';

const connection = (database: string) => ({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  user: process.env.POSTGRES_USERNAME,
  password: process.env.POSTGRES_PASSWORD,
  database,
});

const newDataSource = () =>
  new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    username: process.env.POSTGRES_USERNAME,
    password: process.env.POSTGRES_PASSWORD,
    database: SCRATCH_DB,
    migrations: [`${MIGRATIONS_DIR}/*.ts`],
    migrationsTableName: 'typeorm_migrations',
  });

async function withAdmin<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(connection(process.env.POSTGRES_DATABASE as string));
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

describe('Flow: migration runner with advisory lock', () => {
  beforeEach(async () => {
    await withAdmin(async (admin) => {
      await admin.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${SCRATCH_DB}`);
    });
  });
  afterAll(() => withAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${SCRATCH_DB} WITH (FORCE)`)));

  const appliedRows = async () => {
    const client = new Client(connection(SCRATCH_DB));
    await client.connect();
    try {
      return (await client.query('SELECT name FROM typeorm_migrations ORDER BY id')).rows.map((row) => row.name as string);
    } finally {
      await client.end();
    }
  };

  it('two instances starting at once on an empty database both succeed and every migration is applied exactly once', async () => {
    const [a, b] = [newDataSource(), newDataSource()];

    const [ranA, ranB] = await Promise.all([runMigrationsWithLock(a), runMigrationsWithLock(b)]);

    const rows = await appliedRows();
    expect(rows).toHaveLength(MIGRATION_COUNT);
    expect(new Set(rows).size).toBe(MIGRATION_COUNT);
    // một bên chạy tất cả, bên kia chờ rồi thấy không còn gì
    expect([ranA.length, ranB.length].sort((x, y) => x - y)).toEqual([0, MIGRATION_COUNT]);
    await Promise.all([a.destroy(), b.destroy()]);
  }, 120_000);

  it('running again on an up-to-date database is a no-op', async () => {
    const first = newDataSource();
    await runMigrationsWithLock(first);
    await first.destroy();

    const second = newDataSource();
    expect(await runMigrationsWithLock(second)).toEqual([]);
    expect(await appliedRows()).toHaveLength(MIGRATION_COUNT);
    await second.destroy();
  }, 120_000);

  it('releases the lock when a migration fails, so the next instance is not stuck', async () => {
    const broken = newDataSource();
    jest.spyOn(broken, 'runMigrations').mockRejectedValueOnce(new Error('migration exploded'));

    await expect(runMigrationsWithLock(broken)).rejects.toThrow('migration exploded');
    await broken.destroy();

    const probe = new Client(connection(SCRATCH_DB));
    await probe.connect();
    try {
      const { rows } = await probe.query('SELECT pg_try_advisory_lock($1) AS free', [MIGRATION_LOCK_KEY]);
      expect(rows[0].free).toBe(true);
    } finally {
      await probe.end();
    }
  }, 120_000);

  it('makes a second runner wait while another holds the lock, and proceeds when it is released', async () => {
    const holder = new Client(connection(SCRATCH_DB));
    await holder.connect();
    await holder.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    const waiting = newDataSource();

    let finished = false;
    const run = runMigrationsWithLock(waiting).then((names) => {
      finished = true;
      return names;
    });
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_500));
    expect(finished).toBe(false);
    expect(await holder.query("SELECT count(*)::int AS n FROM pg_tables WHERE tablename = 'typeorm_migrations'")).toMatchObject({
      rows: [{ n: 0 }],
    });

    await holder.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    await holder.end();

    expect(await run).toHaveLength(MIGRATION_COUNT);
    await waiting.destroy();
  }, 120_000);
});
