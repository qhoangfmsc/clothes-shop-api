import { MEDIA_ALLOWED_MIME_TYPES, MediaMimeType } from './media.constant';

/** Tên hiển thị = tên file gốc, bỏ path/ký tự điều khiển, cắt ≤255 */
export function displayName(originalName: string): string {
  const base = [...(originalName.split(/[\\/]/).pop() ?? '')]
    .filter((ch) => ch.charCodeAt(0) > 0x1f && ch.charCodeAt(0) !== 0x7f)
    .join('')
    .trim();
  return (base || 'image').slice(0, 255);
}

/** Tên an toàn cho storage key: ASCII, [a-z0-9._-], đúng extension theo mime */
export function sanitizeStorageName(originalName: string, mimeType: MediaMimeType): string {
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

export function sniffImageMime(buf: Buffer): MediaMimeType | null {
  const ascii = (start: number, end: number) => buf.subarray(start, end).toString('latin1');

  let mime: MediaMimeType | null = null;
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) mime = 'image/jpeg';
  else if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) mime = 'image/png';
  else if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) mime = 'image/gif';
  else if (buf.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') mime = 'image/webp';
  else if (buf.length >= 12 && ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))) mime = 'image/avif';

  return mime && MEDIA_ALLOWED_MIME_TYPES.includes(mime) ? mime : null;
}
