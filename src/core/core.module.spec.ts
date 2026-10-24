import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

/** `ConfigModule.forRoot({ validate })` chạy ngay khi module được nạp: nạp `core.module` trong tiến trình con với env riêng và xem nó có chịu chạy không */
function loadCoreModule(env: Record<string, string>) {
  const root = resolve(__dirname, '../..');
  return spawnSync(
    process.execPath,
    ['-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', '-e', "require('./src/core/core.module')"],
    {
      cwd: root,
      env: { PATH: process.env.PATH ?? '', TS_NODE_PROJECT: resolve(root, 'tsconfig.json'), ...env },
      encoding: 'utf8',
      timeout: 60_000,
    },
  );
}

describe('CoreModule configuration check', () => {
  it('refuses to start in production with a weak JWT secret, naming the variable but not its value', () => {
    const result = loadCoreModule({ NODE_ENV: 'production', JWT_SECRET: 'weak-secret-value' });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('JWT_SECRET');
    expect(result.stderr).not.toContain('weak-secret-value');
  });

  it('loads outside production even without the production variables', () => {
    const result = loadCoreModule({ NODE_ENV: 'development' });

    expect(result.stderr).not.toContain('Cấu hình môi trường không hợp lệ');
    expect(result.status).toBe(0);
  });
});
