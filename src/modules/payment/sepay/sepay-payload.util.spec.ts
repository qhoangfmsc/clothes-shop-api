import { extractTransferCodes, normalizeAccountNumber, parseSepayPayload } from './sepay-payload.util';

const buf = (value: unknown) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
const valid = {
  id: 92704,
  gateway: 'Vietcombank',
  accountNumber: '1017588888',
  code: 'DH8K4T72M9',
  content: 'DH8K4T72M9 chuyen tien',
  transferType: 'in',
  transferAmount: 5000000,
};

describe('parseSepayPayload', () => {
  it('parses a valid payload and keeps the raw object', () => {
    const payload = parseSepayPayload(buf(valid));
    expect(payload).toMatchObject({
      id: '92704',
      transferType: 'in',
      transferAmount: 5000000,
      accountNumber: '1017588888',
      code: 'DH8K4T72M9',
    });
    expect(payload.raw).toEqual(valid);
  });

  it('treats a missing/non-string code as null and missing content as empty', () => {
    const payload = parseSepayPayload(buf({ ...valid, code: null, content: undefined }));
    expect(payload.code).toBeNull();
    expect(payload.content).toBe('');
  });

  it.each([
    ['not JSON', 'nope'],
    ['an array', '[]'],
    ['missing id', { ...valid, id: undefined }],
    ['empty id', { ...valid, id: '' }],
    ['missing transferType', { ...valid, transferType: undefined }],
    ['string amount', { ...valid, transferAmount: '5000' }],
    ['negative amount', { ...valid, transferAmount: -1 }],
    ['fractional amount', { ...valid, transferAmount: 10.5 }],
    ['missing accountNumber', { ...valid, accountNumber: ' ' }],
  ])('rejects %s', (_name, body) => {
    expect(() => parseSepayPayload(buf(body))).toThrow('Invalid SePay webhook payload');
  });
});

describe('extractTransferCodes', () => {
  it('finds PREFIX + 8 chars in the SePay code field', () => {
    expect(extractTransferCodes('DH', 'DHG29JR5A8', 'ignored')).toEqual(['DHG29JR5A8']);
  });

  it('finds it in the transfer content, case-insensitively and ignoring surrounding text', () => {
    expect(extractTransferCodes('DH', null, 'nguyen van a dhg29jr5a8chuyentien')).toEqual(['DHG29JR5A8']);
    expect(extractTransferCodes('DH', null, 'NGUYEN VAN A DHG29JR5A8 CHUYEN KHOAN')).toEqual(['DHG29JR5A8']);
  });

  it('scans the content too when SePay truncated or altered its `code` field, without duplicates', () => {
    expect(extractTransferCodes('DH', 'DHG29J', 'DHG29JR5A8 thanh toan')).toEqual(['DHG29JR5A8']);
    expect(extractTransferCodes('DH', 'DHG29JR5A8', 'DHG29JR5A8')).toEqual(['DHG29JR5A8']);
  });

  it('returns every distinct candidate (a name containing the prefix does not hide the real code)', () => {
    expect(extractTransferCodes('DH', null, 'DHUNG DHG29JR5A8')).toEqual(['DHG29JR5A8']);
    expect(extractTransferCodes('DH', 'DHAAAA2222', 'DHBBBB3333')).toEqual(['DHAAAA2222', 'DHBBBB3333']);
  });

  it('returns [] when there is nothing of the expected shape', () => {
    expect(extractTransferCodes('DH', null, 'chuyen tien mua hang')).toEqual([]);
    expect(extractTransferCodes('DH', 'DH123', 'DH12')).toEqual([]);
    expect(extractTransferCodes('DH', null, 'SEVN63DC8E5C')).toEqual([]);
  });

  it('escapes regex characters in the prefix', () => {
    expect(extractTransferCodes('D.', null, 'DXABCDEFGH')).toEqual([]);
  });
});

describe('normalizeAccountNumber', () => {
  it('strips spaces and dashes', () => {
    expect(normalizeAccountNumber('1017 5888-88')).toBe('1017588888');
  });
});
