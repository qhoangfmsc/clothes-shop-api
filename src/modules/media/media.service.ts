import { randomBytes } from 'node:crypto';
import { typeormListQuery } from '@common/base/typeorm-list-query.util';
import { throwAppError } from '@common/exceptions/app.exception';
import { EMediaErrorCode } from '@common/exceptions/error-codes';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MediaFileDto } from './dtos/media-file.dto';
import { MediaQueryDto } from './dtos/media-query.dto';
import { MEDIA_ALLOWED_MIME_TYPES, MEDIA_KEY_PREFIX_LENGTH, MediaMimeType } from './media.constant';
import { MediaFile } from './media-file.entity';

interface StorageConfig {
  baseUrl: string;
  serviceKey: string;
  bucket: string;
}

const STORAGE_TIMEOUT_MS = 15_000;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(MediaFile)
    private readonly mediaRepo: Repository<MediaFile>,
  ) {}

  // ============================================
  // ADMIN METHODS
  // ============================================

  async ping() {
    const config = this.getConfig();
    const res = await this.storageFetch(config, `/bucket/${encodeURIComponent(config.bucket)}`);

    if (res.status === 404 || res.status === 400) {
      throwAppError(
        EMediaErrorCode.MEDIA_NOT_CONFIGURED,
        `Storage bucket "${config.bucket}" does not exist`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    await this.assertOk(res, 'ping');

    const bucket = (await res.json()) as { public?: boolean };
    return { ok: true, bucket: config.bucket, public: bucket.public === true };
  }

  async findAll(query: MediaQueryDto) {
    // Chỉ đọc DB — không cần cấu hình storage
    const qb = this.mediaRepo.createQueryBuilder('m');
    const { items, total, page, limit, totalPages } = await typeormListQuery(qb, 'm', query, {
      sortableColumns: ['createdAt', 'name', 'size'],
      searchableColumns: ['name'],
    });

    return { data: items.map((m) => this.toDto(m)), total, page, limit, totalPages };
  }

  async upload(file?: Express.Multer.File) {
    const config = this.getConfig();

    if (!file?.buffer?.length) {
      throwAppError(EMediaErrorCode.MEDIA_FILE_REQUIRED);
    }

    // Không tin mimetype do client gửi — xác định theo magic bytes
    const mimeType = this.sniffImageMime(file.buffer);
    if (!mimeType) {
      throwAppError(EMediaErrorCode.MEDIA_INVALID_TYPE);
    }

    const key = `${randomBytes(MEDIA_KEY_PREFIX_LENGTH / 2).toString('hex')}-${this.sanitizeName(file.originalname, mimeType)}`;

    const res = await this.storageFetch(config, `/object/${encodeURIComponent(config.bucket)}/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': mimeType, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'false' },
      body: new Uint8Array(file.buffer),
    });
    await this.assertOk(res, 'upload');

    let media: MediaFile;
    try {
      media = await this.mediaRepo.save(
        this.mediaRepo.create({ name: this.displayName(file.originalname), storageKey: key, mimeType, size: file.size }),
      );
    } catch (err) {
      // Không để lại object mồ côi trên storage khi ghi DB lỗi
      await this.removeObject(config, key).catch(() => undefined);
      throw err;
    }

    return { data: this.toDto(media) };
  }

  async delete(fileId: string) {
    const config = this.getConfig();

    const media = await this.mediaRepo.findOne({ where: { id: fileId } });
    if (!media) {
      throwAppError(EMediaErrorCode.MEDIA_FILE_NOT_FOUND, undefined, HttpStatus.NOT_FOUND);
    }

    // Storage trước, DB sau: nếu storage lỗi thì row còn nguyên để admin retry.
    // Object đã mất sẵn trên storage thì vẫn xoá row (idempotent).
    await this.removeObject(config, media.storageKey);
    await this.mediaRepo.delete({ id: media.id });

    return { ok: true };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  /** Đọc cấu hình mỗi lần gọi; thiếu key/bucket → 503 kèm hướng dẫn cho FE */
  private getConfig(): StorageConfig {
    const url = this.configService.get<string>('SUPABASE_URL')?.trim();
    const serviceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    const bucket = this.configService.get<string>('SUPABASE_STORAGE_BUCKET')?.trim();

    const missing = [!url && 'SUPABASE_URL', !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY', !bucket && 'SUPABASE_STORAGE_BUCKET'].filter(
      Boolean,
    );

    if (missing.length > 0 || !url || !serviceKey || !bucket) {
      throwAppError(
        EMediaErrorCode.MEDIA_NOT_CONFIGURED,
        `Media storage is not configured. Missing env: ${missing.join(', ')}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return { baseUrl: url.replace(/\/+$/, ''), serviceKey, bucket };
  }

  private async storageFetch(config: StorageConfig, path: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await fetch(`${config.baseUrl}/storage/v1${path}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          Authorization: `Bearer ${config.serviceKey}`,
          apikey: config.serviceKey,
        },
        signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`Storage request failed: ${(err as Error).message}`);
      return throwAppError(EMediaErrorCode.MEDIA_STORAGE_ERROR, 'Cannot reach media storage', HttpStatus.BAD_GATEWAY);
    }
  }

  /** Non-2xx từ Supabase → map sang AppException; chỉ log body lỗi, không bao giờ log header/key */
  private async assertOk(res: Response, action: string): Promise<void> {
    if (res.ok) return;

    const detail = await res.text().catch(() => '');
    this.logger.error(`Storage ${action} failed [${res.status}]: ${detail.slice(0, 300)}`);

    if (res.status === 401 || res.status === 403) {
      throwAppError(
        EMediaErrorCode.MEDIA_NOT_CONFIGURED,
        'Media storage rejected the credentials — check SUPABASE_SERVICE_ROLE_KEY',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    // Supabase Storage có thể trả HTTP 400 kèm {"statusCode":"413","code":"EntityTooLarge"} trong body
    if (res.status === 413 || this.isEntityTooLarge(detail)) {
      throwAppError(EMediaErrorCode.MEDIA_FILE_TOO_LARGE, undefined, HttpStatus.PAYLOAD_TOO_LARGE);
    }
    throwAppError(EMediaErrorCode.MEDIA_STORAGE_ERROR, `Media storage ${action} failed`, HttpStatus.BAD_GATEWAY);
  }

  private isEntityTooLarge(detail: string): boolean {
    try {
      const body = JSON.parse(detail) as { statusCode?: string | number; code?: string };
      return String(body.statusCode) === '413' || body.code === 'EntityTooLarge';
    } catch {
      return false;
    }
  }

  private publicUrl(config: StorageConfig, key: string): string {
    return `${config.baseUrl}/storage/v1/object/public/${encodeURIComponent(config.bucket)}/${encodeURIComponent(key)}`;
  }

  private async removeObject(config: StorageConfig, key: string): Promise<void> {
    const res = await this.storageFetch(config, `/object/${encodeURIComponent(config.bucket)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [key] }),
    });
    await this.assertOk(res, 'delete');
  }

  private toDto(m: MediaFile): MediaFileDto {
    return {
      id: m.id,
      name: m.name,
      mimeType: m.mimeType,
      sizeOriginal: m.size,
      createdAt: m.createdAt.toISOString(),
      url: this.publicUrl(this.getConfig(), m.storageKey),
    };
  }

  /** Tên hiển thị = tên file gốc, bỏ path/ký tự điều khiển, cắt ≤255 */
  private displayName(originalName: string): string {
    const base = [...(originalName.split(/[\\/]/).pop() ?? '')]
      .filter((ch) => ch.charCodeAt(0) > 0x1f && ch.charCodeAt(0) !== 0x7f)
      .join('')
      .trim();
    return (base || 'image').slice(0, 255);
  }

  /** Tên an toàn cho storage key: ASCII, [a-z0-9._-], đúng extension theo mime */
  private sanitizeName(originalName: string, mimeType: MediaMimeType): string {
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[mimeType];
    const base = originalName
      .replace(/\.[^.]*$/, '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return `${base || 'image'}.${ext}`;
  }

  private sniffImageMime(buf: Buffer): MediaMimeType | null {
    const ascii = (start: number, end: number) => buf.subarray(start, end).toString('latin1');

    let mime: MediaMimeType | null = null;
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) mime = 'image/jpeg';
    else if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
      mime = 'image/png';
    else if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) mime = 'image/gif';
    else if (buf.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') mime = 'image/webp';
    else if (buf.length >= 12 && ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))) mime = 'image/avif';

    return mime && MEDIA_ALLOWED_MIME_TYPES.includes(mime) ? mime : null;
  }
}
