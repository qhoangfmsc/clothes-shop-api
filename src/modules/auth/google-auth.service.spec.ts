import { ConfigService } from '@nestjs/config';
import { GoogleAuthService } from './google-auth.service';

const unauthorized = (errorCode: number, message: string) => ({ status: 401, response: { errorCode, message } });

function setup() {
  const config = { get: jest.fn((_key: string, fallback = '') => fallback) } as unknown as ConfigService;
  const service = new GoogleAuthService(config);
  const client = { verifyIdToken: jest.fn(), getToken: jest.fn() };
  (service as unknown as { client: typeof client }).client = client;
  return { service, client };
}

const ticket = (payload: Record<string, string> | undefined) => ({ getPayload: () => payload });

describe('GoogleAuthService.verifyIdToken', () => {
  it('maps a valid payload', async () => {
    const { service, client } = setup();
    client.verifyIdToken.mockResolvedValue(ticket({ email: 'a@b.com', name: 'A', picture: 'p', sub: 'g1' }));
    await expect(service.verifyIdToken('t')).resolves.toEqual({ email: 'a@b.com', name: 'A', picture: 'p', sub: 'g1' });
  });

  it('rejects a token without an email (2210)', async () => {
    const { service, client } = setup();
    client.verifyIdToken.mockResolvedValue(ticket({ sub: 'g1' }));
    await expect(service.verifyIdToken('t')).rejects.toMatchObject(unauthorized(2210, 'Invalid Google token: missing email'));
    client.verifyIdToken.mockResolvedValue(ticket(undefined));
    await expect(service.verifyIdToken('t')).rejects.toMatchObject(unauthorized(2210, 'Invalid Google token: missing email'));
  });

  it('turns a library failure into 2210', async () => {
    const { service, client } = setup();
    client.verifyIdToken.mockRejectedValue(new Error('bad signature'));
    await expect(service.verifyIdToken('t')).rejects.toMatchObject(unauthorized(2210, 'Invalid Google token'));
  });
});

describe('GoogleAuthService.exchangeAuthCode', () => {
  it('verifies the id_token it receives and keeps that error as is (not re-wrapped)', async () => {
    const { service, client } = setup();
    client.getToken.mockResolvedValue({ tokens: { id_token: 'idt' } });
    client.verifyIdToken.mockResolvedValue(ticket({ sub: 'g1' }));
    await expect(service.exchangeAuthCode('code')).rejects.toMatchObject(unauthorized(2210, 'Invalid Google token: missing email'));
  });

  it('rejects an exchange that returns no usable token (2211)', async () => {
    const { service, client } = setup();
    client.getToken.mockResolvedValue({ tokens: {} });
    await expect(service.exchangeAuthCode('code')).rejects.toMatchObject(unauthorized(2211, 'No token received from Google'));
  });

  it('turns a library failure into 2211', async () => {
    const { service, client } = setup();
    client.getToken.mockRejectedValue(new Error('invalid_grant'));
    await expect(service.exchangeAuthCode('code')).rejects.toMatchObject(unauthorized(2211, 'Failed to exchange authorization code'));
  });
});

describe('GoogleAuthService.fetchUserInfo', () => {
  afterEach(() => jest.restoreAllMocks());
  const mockFetch = (impl: () => unknown) => jest.spyOn(globalThis, 'fetch').mockImplementation(impl as never);

  it('maps a valid userinfo response', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ email: 'a@b.com', name: 'A', picture: 'p', sub: 'g1' }) }));
    await expect(setup().service.fetchUserInfo('at')).resolves.toEqual({ email: 'a@b.com', name: 'A', picture: 'p', sub: 'g1' });
  });

  it('rejects a non-OK response (2212)', async () => {
    mockFetch(async () => ({ ok: false }));
    await expect(setup().service.fetchUserInfo('at')).rejects.toMatchObject(unauthorized(2212, 'Failed to fetch Google user info'));
  });

  it('rejects userinfo without an email (2210)', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ({ sub: 'g1' }) }));
    await expect(setup().service.fetchUserInfo('at')).rejects.toMatchObject(unauthorized(2210, 'Google user info missing email'));
  });

  it('turns a network failure into 2212', async () => {
    mockFetch(async () => {
      throw new Error('ECONNRESET');
    });
    await expect(setup().service.fetchUserInfo('at')).rejects.toMatchObject(unauthorized(2212, 'Failed to verify Google access token'));
  });
});
