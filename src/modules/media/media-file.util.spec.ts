import { displayName, sanitizeStorageName, sniffImageMime } from './media-file.util';

const bytes = (...values: number[]) => Buffer.from(values);
const ascii = (text: string, pad = 0) => Buffer.concat([Buffer.from(text, 'latin1'), Buffer.alloc(pad)]);

describe('sniffImageMime', () => {
  it.each([
    ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0)],
    ['image/png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)],
    ['image/gif', ascii('GIF87a')],
    ['image/gif', ascii('GIF89a')],
    ['image/webp', Buffer.concat([ascii('RIFF'), bytes(0, 0, 0, 0), ascii('WEBP')])],
    ['image/avif', Buffer.concat([bytes(0, 0, 0, 0), ascii('ftypavif')])],
    ['image/avif', Buffer.concat([bytes(0, 0, 0, 0), ascii('ftypavis')])],
  ])('recognises %s by its signature', (mime, buffer) => {
    expect(sniffImageMime(buffer)).toBe(mime);
  });

  it('returns null for anything else, including short and empty buffers', () => {
    expect(sniffImageMime(Buffer.alloc(0))).toBeNull();
    expect(sniffImageMime(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImageMime(ascii('<html><body>not an image</body></html>'))).toBeNull();
    expect(sniffImageMime(Buffer.concat([bytes(0, 0, 0, 0), ascii('ftypheic')]))).toBeNull();
  });
});

describe('sanitizeStorageName', () => {
  it('lowercases, drops Vietnamese accents, replaces other characters with dashes and uses the extension of the sniffed type', () => {
    expect(sanitizeStorageName('Áo Thun Đẹp (1).PNG', 'image/jpeg')).toBe('ao-thun-dep-1.jpg');
    expect(sanitizeStorageName('x.y.z', 'image/webp')).toBe('x-y.webp');
  });

  it('falls back to "image" when nothing usable is left and caps the base at 80 characters', () => {
    expect(sanitizeStorageName('###.png', 'image/png')).toBe('image.png');
    expect(sanitizeStorageName(`${'a'.repeat(200)}.png`, 'image/png')).toBe(`${'a'.repeat(80)}.png`);
  });
});

describe('displayName', () => {
  it('keeps only the file name of a path and drops control characters', () => {
    expect(displayName('C:\\fakepath\\summer look.jpg')).toBe('summer look.jpg');
    expect(displayName('a/b/c\u0000d\u007f.jpg')).toBe('cd.jpg');
  });

  it('falls back to "image" for an empty name and caps at 255 characters', () => {
    expect(displayName('   ')).toBe('image');
    expect(displayName('x'.repeat(300))).toHaveLength(255);
  });
});
