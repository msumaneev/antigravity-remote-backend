import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { callRPC } from '../../src/agentapi/rpc';
import * as discovery from '../../src/agentapi/discovery';

vi.mock('../../src/agentapi/discovery', () => ({
  discoverLanguageServer: vi.fn(),
}));

describe('callRPC', () => {
  const mockLS = {
    pid: 12345,
    csrfToken: 'test-csrf-token',
    httpsPort: 54321,
    httpPort: 54322,
    address: '127.0.0.1',
    agentApiPath: '/path/to/ls',
  };

  beforeEach(() => {
    vi.mocked(discovery.discoverLanguageServer).mockReturnValue(mockLS as any);
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it('should throw when LS is not found', async () => {
    vi.mocked(discovery.discoverLanguageServer).mockReturnValue(null);
    await expect(callRPC('Heartbeat')).rejects.toThrow('Language Server not found');
  });

  it('should send correct headers', async () => {
    const scope = nock(`https://127.0.0.1:${mockLS.httpsPort}`)
      .post('/exa.language_server_pb.LanguageServerService/Heartbeat')
      .matchHeader('Content-Type', 'application/json')
      .matchHeader('Connect-Protocol-Version', '1')
      .matchHeader('X-Codeium-Csrf-Token', mockLS.csrfToken)
      .reply(200, { lastExtensionHeartbeat: '2026-01-01T00:00:00Z' });

    await callRPC('Heartbeat');
    expect(scope.isDone()).toBe(true);
  });

  it('should return parsed JSON response', async () => {
    nock(`https://127.0.0.1:${mockLS.httpsPort}`)
      .post('/exa.language_server_pb.LanguageServerService/GetUserStatus')
      .reply(200, { userStatus: { name: 'Test', email: 'test@test.com' } });

    const result = await callRPC('GetUserStatus');
    expect(result.userStatus.name).toBe('Test');
  });

  it('should reject on RPC error response', async () => {
    nock(`https://127.0.0.1:${mockLS.httpsPort}`)
      .post('/exa.language_server_pb.LanguageServerService/GetSlashCommands')
      .reply(200, { code: 'unknown', message: 'some error' });

    await expect(callRPC('GetSlashCommands')).rejects.toMatchObject({
      code: 'unknown',
    });
  });

  it('should reject on network error', async () => {
    nock(`https://127.0.0.1:${mockLS.httpsPort}`)
      .post('/exa.language_server_pb.LanguageServerService/Heartbeat')
      .replyWithError('connection refused');

    await expect(callRPC('Heartbeat')).rejects.toThrow();
  });


  it('should pass request body', async () => {
    const body = { conversationId: 'test-id' };
    const scope = nock(`https://127.0.0.1:${mockLS.httpsPort}`)
      .post('/exa.language_server_pb.LanguageServerService/ForceStopCascadeTree', body)
      .reply(200, {});

    await callRPC('ForceStopCascadeTree', body);
    expect(scope.isDone()).toBe(true);
  });
});
