import { type Builders, bearer, createBuilders, createTestApp, type TestApp, truncateAll } from '../../support';
import { storageUrl, useStorageEnv } from '../review/steps';

/** Batch 24 (media): thư viện ảnh admin, kiểm tra kết nối, upload và xoá. Supabase Storage giả bằng `jest.spyOn(globalThis, 'fetch')`. */
describe('Flow: admin media', () => {
  let t: TestApp;
  let b: Builders;
  let restoreEnv: () => void;

  beforeAll(async () => {
    t = await createTestApp();
    b = createBuilders(t.dataSource);
    restoreEnv = useStorageEnv();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await truncateAll(t.dataSource);
  });
  afterAll(async () => {
    restoreEnv();
    await t.close();
  });

  type User = Awaited<ReturnType<Builders['user']>>;
  const rows = <R>(sql: string, params: unknown[] = []) => t.dataSource.query(sql, params) as Promise<R[]>;
  const error = (res: { status: number; body: { errorCode?: number; message?: string } }) => ({
    status: res.status,
    errorCode: res.body.errorCode,
    message: res.body.message,
  });
  const list = (admin: User, query: object = {}) => t.api.get('/api/admin/media').query(query).set(bearer(t, admin));
  const ping = (admin: User) => t.api.get('/api/admin/media/ping').set(bearer(t, admin));
  const remove = (admin: User, id: string) => t.api.delete(`/api/admin/media/${id}`).set(bearer(t, admin));
  const upload = (admin: User, file?: { content: Buffer; filename?: string; contentType?: string }) => {
    const req = t.api.post('/api/admin/media').set(bearer(t, admin));
    return file
      ? req.attach('file', file.content, { filename: file.filename ?? 'photo.jpg', contentType: file.contentType ?? 'image/jpeg' })
      : req;
  };
  const storage = (status = 200, body: unknown = {}) =>
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const ids = (res: { body: { data: { id: string }[] } }) => res.body.data.map((row) => row.id);
  const day = (offset: number) => new Date(Date.UTC(2026, 9, 1 + offset, 12));

  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const GIF = Buffer.from('GIF89a-data');
  const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
  const AVIF = Buffer.concat([Buffer.from([0, 0, 0, 0]), Buffer.from('ftypavif'), Buffer.from([0, 0])]);

  /** Dòng `media_files` dựng sẵn (không đi qua API). */
  async function mediaFile(
    overrides: Partial<{
      name: string;
      storageKey: string;
      mimeType: string;
      size: number;
      purpose: string;
      uploadedBy: string | null;
      createdAt: Date;
    }> = {},
  ) {
    const key = overrides.storageKey ?? `key-${Math.random().toString(36).slice(2, 10)}.jpg`;
    const [row] = await rows<{ id: string }>(
      `INSERT INTO media_files (id, name, storage_key, mime_type, size, purpose, uploaded_by, created_at, updated_at)
       VALUES ('m' || substr(md5(random()::text), 1, 15), $1, $2, $3, $4, $5, $6, $7, $7) RETURNING id`,
      [
        overrides.name ?? 'photo.jpg',
        key,
        overrides.mimeType ?? 'image/jpeg',
        overrides.size ?? 1000,
        overrides.purpose ?? 'LIBRARY',
        overrides.uploadedBy ?? null,
        overrides.createdAt ?? new Date(),
      ],
    );
    return { id: row.id, key };
  }

  describe('GET /api/admin/media/ping', () => {
    it('reports the bucket and whether it is public, calling the storage with the service key', async () => {
      const admin = await b.admin();
      const spy = storage(200, { public: true });

      const res = await ping(admin).expect(200);

      expect(res.body).toEqual({ ok: true, bucket: 'flow-bucket', public: true });
      const [target, init] = spy.mock.calls[0] as [string, { headers: Record<string, string> }];
      expect(target).toBe('https://storage.flow.test/storage/v1/bucket/flow-bucket');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer flow-key', apikey: 'flow-key' });
      storage(200, {});
      expect((await ping(admin).expect(200)).body.public).toBe(false);
    });

    it('answers 503 / 1601 when the bucket does not exist or the key is refused, and 502 / 1605 when storage fails or is unreachable', async () => {
      const admin = await b.admin();
      const spy = jest.spyOn(globalThis, 'fetch');

      spy.mockResolvedValueOnce(new Response('{}', { status: 404 }));
      const missing = await ping(admin);
      spy.mockResolvedValueOnce(new Response('{}', { status: 400 }));
      const badRequest = await ping(admin);
      spy.mockResolvedValueOnce(new Response('{}', { status: 401 }));
      const refused = await ping(admin);
      spy.mockResolvedValueOnce(new Response('boom', { status: 500 }));
      const failed = await ping(admin);
      spy.mockRejectedValueOnce(new Error('ECONNREFUSED') as never);
      const unreachable = await ping(admin);

      expect(error(missing)).toMatchObject({ status: 503, errorCode: 1601, message: expect.stringContaining('flow-bucket') });
      expect(error(badRequest)).toMatchObject({ status: 503, errorCode: 1601 });
      expect(error(refused)).toMatchObject({ status: 503, errorCode: 1601, message: expect.stringContaining('SUPABASE_SERVICE_ROLE_KEY') });
      expect(error(failed)).toMatchObject({ status: 502, errorCode: 1605 });
      expect(error(unreachable)).toMatchObject({ status: 502, errorCode: 1605, message: 'Cannot reach media storage' });
    });

    it('answers 503 / 1601 naming every missing variable when the storage is not configured, without calling it', async () => {
      const admin = await b.admin();
      const spy = storage();
      const saved = { ...process.env };
      process.env.SUPABASE_URL = '';
      process.env.SUPABASE_SERVICE_ROLE_KEY = '';

      const res = await ping(admin);
      Object.assign(process.env, saved);

      expect(error(res)).toMatchObject({
        status: 503,
        errorCode: 1601,
        message: expect.stringContaining('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY'),
      });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/admin/media', () => {
    it('lists library images newest first with their public URL, leaving out review photos', async () => {
      const [admin, user] = [await b.admin(), await b.user()];
      const [old, recent] = [
        await mediaFile({ name: 'old.jpg', storageKey: 'k-old.jpg', size: 10, createdAt: day(1) }),
        await mediaFile({ name: 'Ảnh mới.png', storageKey: 'k new.png', mimeType: 'image/png', size: 2048, createdAt: day(2) }),
      ];
      await mediaFile({ purpose: 'REVIEW', uploadedBy: user.id });

      const res = await list(admin).expect(200);

      expect(ids(res)).toEqual([recent.id, old.id]);
      expect(res.body).toMatchObject({ total: 2, page: 1, limit: 25, totalPages: 1 });
      expect(res.body.data[0]).toEqual({
        id: recent.id,
        name: 'Ảnh mới.png',
        mimeType: 'image/png',
        sizeOriginal: 2048,
        createdAt: day(2).toISOString(),
        url: storageUrl('k new.png'),
      });
    });

    it('is empty without files (still needs the storage URL configured)', async () => {
      const admin = await b.admin();

      expect((await list(admin).expect(200)).body).toMatchObject({ data: [], total: 0 });
      const saved = process.env.SUPABASE_URL;
      process.env.SUPABASE_URL = '';
      const res = await list(admin);
      process.env.SUPABASE_URL = saved;

      expect(error(res)).toMatchObject({ status: 503, errorCode: 1601, message: expect.stringContaining('SUPABASE_URL') });
    });

    it('searches the name, sorts by name and size, and paginates', async () => {
      const admin = await b.admin();
      const [a, c, d] = [
        await mediaFile({ name: 'cam.jpg', size: 300, createdAt: day(1) }),
        await mediaFile({ name: 'Ao-polo.jpg', size: 100, createdAt: day(2) }),
        await mediaFile({ name: 'bo.jpg', size: 200, createdAt: day(3) }),
      ];

      expect(ids(await list(admin, { search: 'POLO' }).expect(200))).toEqual([c.id]);
      expect(ids(await list(admin, { search: 'khong-co' }).expect(200))).toEqual([]);
      expect(ids(await list(admin, { sort: 'name' }).expect(200))).toEqual([c.id, d.id, a.id]);
      expect(ids(await list(admin, { sort: '-size' }).expect(200))).toEqual([a.id, d.id, c.id]);
      expect(ids(await list(admin, { sort: 'createdAt' }).expect(200))).toEqual([a.id, c.id, d.id]);
      const page = await list(admin, { limit: 2, page: 2 }).expect(200);
      expect(ids(page)).toEqual([a.id]);
      expect(page.body).toMatchObject({ total: 3, page: 2, limit: 2, totalPages: 2 });
    });

    it.each([
      ['a sort field outside the whitelist', { sort: 'mimeType' }],
      ['the removed `sorts` parameter', { sorts: 'name' }],
      ['a limit above 200', { limit: 201 }],
      ['a page below 1', { page: 0 }],
      ['a search longer than 255 characters', { search: 'x'.repeat(256) }],
    ])('rejects %s with a validation error (no errorCode)', async (_name, query) => {
      const res = await list(await b.admin(), query);

      expect([res.status, res.body.errorCode]).toEqual([400, undefined]);
    });
  });

  describe('POST /api/admin/media', () => {
    it('uploads to the bucket under a safe key, records a library file without an owner, and returns its public URL', async () => {
      const admin = await b.admin();
      const spy = storage();

      const res = await upload(admin, { content: PNG, filename: 'Ảnh Áo Đẹp (1).PNG', contentType: 'application/octet-stream' }).expect(
        201,
      );

      const [row] = await rows<{
        id: string;
        name: string;
        storage_key: string;
        mime_type: string;
        size: number;
        purpose: string;
        uploaded_by: string | null;
      }>('SELECT id, name, storage_key, mime_type, size, purpose, uploaded_by FROM media_files');
      expect(row).toMatchObject({
        name: 'Ảnh Áo Đẹp (1).PNG',
        mime_type: 'image/png',
        size: PNG.length,
        purpose: 'LIBRARY',
        uploaded_by: null,
      });
      expect(row.storage_key).toMatch(/^[0-9a-f]{12}-anh-ao-dep-1\.png$/);
      expect(res.body.data).toEqual({
        id: row.id,
        name: 'Ảnh Áo Đẹp (1).PNG',
        mimeType: 'image/png',
        sizeOriginal: PNG.length,
        createdAt: expect.any(String),
        url: storageUrl(row.storage_key),
      });
      const [target, init] = spy.mock.calls[0] as [string, { method: string; headers: Record<string, string> }];
      expect(target).toBe(`https://storage.flow.test/storage/v1/object/flow-bucket/${encodeURIComponent(row.storage_key)}`);
      expect(init).toMatchObject({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'image/png',
          'Cache-Control': 'max-age=31536000',
          'x-upsert': 'false',
          Authorization: 'Bearer flow-key',
        }),
      });
      expect((await list(admin).expect(200)).body.data[0].url).toBe(res.body.data.url);
    });

    it.each([
      ['image/jpeg', 'jpg', JPEG],
      ['image/png', 'png', PNG],
      ['image/gif', 'gif', GIF],
      ['image/webp', 'webp', WEBP],
      ['image/avif', 'avif', AVIF],
    ])('accepts %s recognised from its bytes and gives the key the matching extension', async (mimeType, ext, content) => {
      const admin = await b.admin();
      storage();

      const res = await upload(admin, { content, filename: 'file.bin', contentType: 'application/octet-stream' }).expect(201);

      expect(res.body.data.mimeType).toBe(mimeType);
      expect((await rows<{ storage_key: string }>('SELECT storage_key FROM media_files'))[0].storage_key).toMatch(
        new RegExp(`^[0-9a-f]{12}-file\\.${ext}$`),
      );
    });

    it('uses "image" when the file name leaves nothing usable', async () => {
      const admin = await b.admin();
      storage();

      await upload(admin, { content: JPEG, filename: '!!!.jpg' }).expect(201);

      expect((await rows<{ storage_key: string }>('SELECT storage_key FROM media_files'))[0].storage_key).toMatch(
        /^[0-9a-f]{12}-image\.jpg$/,
      );
    });

    it('answers 400 / 1602 without a file or with an empty one, and 400 / 1603 for a file that is not a picture, calling no storage', async () => {
      const admin = await b.admin();
      const spy = storage();

      const none = await upload(admin);
      const empty = await upload(admin, { content: Buffer.alloc(0) });
      const text = await upload(admin, { content: Buffer.from('<?php echo 1; ?>'), filename: 'x.jpg', contentType: 'image/jpeg' });

      expect(error(none)).toMatchObject({ status: 400, errorCode: 1602 });
      expect(error(empty)).toMatchObject({ status: 400, errorCode: 1602 });
      expect(error(text)).toMatchObject({ status: 400, errorCode: 1603 });
      expect(spy).not.toHaveBeenCalled();
      expect(await rows('SELECT 1 FROM media_files')).toHaveLength(0);
    });

    it('refuses a file over 10 MB with 413 and no errorCode (stopped by the upload interceptor)', async () => {
      const admin = await b.admin();
      const spy = storage();

      const res = await upload(admin, { content: Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)]) });

      expect([res.status, res.body.errorCode]).toEqual([413, undefined]);
      expect(spy).not.toHaveBeenCalled();
    });

    it('maps storage failures: 413 / 1606 when it says too large (also inside a 400 body), 503 / 1601 for refused credentials, 502 / 1605 otherwise, and keeps no record', async () => {
      const admin = await b.admin();
      const spy = jest.spyOn(globalThis, 'fetch');

      spy.mockResolvedValueOnce(new Response('big', { status: 413 }));
      const tooLarge = await upload(admin, { content: JPEG });
      spy.mockResolvedValueOnce(new Response(JSON.stringify({ statusCode: '413', code: 'EntityTooLarge' }), { status: 400 }));
      const tooLargeInBody = await upload(admin, { content: JPEG });
      spy.mockResolvedValueOnce(new Response('denied', { status: 403 }));
      const refused = await upload(admin, { content: JPEG });
      spy.mockResolvedValueOnce(new Response('boom', { status: 500 }));
      const failed = await upload(admin, { content: JPEG });
      spy.mockRejectedValueOnce(new Error('ETIMEDOUT') as never);
      const unreachable = await upload(admin, { content: JPEG });

      expect(error(tooLarge)).toMatchObject({ status: 413, errorCode: 1606 });
      expect(error(tooLargeInBody)).toMatchObject({ status: 413, errorCode: 1606 });
      expect(error(refused)).toMatchObject({ status: 503, errorCode: 1601 });
      expect(error(failed)).toMatchObject({ status: 502, errorCode: 1605 });
      expect(error(unreachable)).toMatchObject({ status: 502, errorCode: 1605 });
      expect(await rows('SELECT 1 FROM media_files')).toHaveLength(0);
    });

    it('answers 503 / 1601 when the service key is missing, before looking at the file', async () => {
      const admin = await b.admin();
      const spy = storage();
      const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = '';

      const res = await upload(admin, { content: JPEG });
      process.env.SUPABASE_SERVICE_ROLE_KEY = saved;

      expect(error(res)).toMatchObject({ status: 503, errorCode: 1601, message: expect.stringContaining('SUPABASE_SERVICE_ROLE_KEY') });
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/admin/media/:fileId', () => {
    it('removes the object from the bucket first, then the record', async () => {
      const admin = await b.admin();
      const [target, kept] = [await mediaFile({ storageKey: 'to-delete.jpg' }), await mediaFile({ storageKey: 'keep.jpg' })];
      const spy = storage(200, []);

      const res = await remove(admin, target.id).expect(200);

      expect(res.body).toEqual({ ok: true });
      const [url, init] = spy.mock.calls[0] as [string, { method: string; body: string }];
      expect(url).toBe('https://storage.flow.test/storage/v1/object/flow-bucket');
      expect(init).toMatchObject({ method: 'DELETE' });
      expect(JSON.parse(init.body)).toEqual({ prefixes: ['to-delete.jpg'] });
      expect(await rows('SELECT id FROM media_files')).toEqual([{ id: kept.id }]);
    });

    it('keeps the record when the storage refuses, so the delete can be retried (502 / 1605, 503 / 1601)', async () => {
      const admin = await b.admin();
      const file = await mediaFile();
      const spy = jest.spyOn(globalThis, 'fetch');

      spy.mockResolvedValueOnce(new Response('boom', { status: 500 }));
      const failed = await remove(admin, file.id);
      spy.mockResolvedValueOnce(new Response('denied', { status: 401 }));
      const refused = await remove(admin, file.id);
      spy.mockRejectedValueOnce(new Error('ECONNRESET') as never);
      const unreachable = await remove(admin, file.id);

      expect(error(failed)).toMatchObject({ status: 502, errorCode: 1605 });
      expect(error(refused)).toMatchObject({ status: 503, errorCode: 1601 });
      expect(error(unreachable)).toMatchObject({ status: 502, errorCode: 1605 });
      expect(await rows('SELECT 1 FROM media_files')).toHaveLength(1);
      storage(200, []);
      await remove(admin, file.id).expect(200);
      expect(await rows('SELECT 1 FROM media_files')).toHaveLength(0);
    });

    it('answers 404 / 1604 for an unknown id, a review photo and a second delete, calling no storage', async () => {
      const [admin, user] = [await b.admin(), await b.user()];
      const [file, review] = [await mediaFile(), await mediaFile({ purpose: 'REVIEW', uploadedBy: user.id })];
      const spy = storage(200, []);
      await remove(admin, file.id).expect(200);
      spy.mockClear();

      const again = await remove(admin, file.id);
      const photo = await remove(admin, review.id);
      const unknown = await remove(admin, 'zzzzzzzzzzzzzzzz');

      for (const res of [again, photo, unknown]) expect(error(res)).toMatchObject({ status: 404, errorCode: 1604 });
      expect(spy).not.toHaveBeenCalled();
      expect(await rows('SELECT id FROM media_files')).toEqual([{ id: review.id }]);
    });
  });
});
