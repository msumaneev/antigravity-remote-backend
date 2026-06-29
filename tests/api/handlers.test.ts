import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupRoutes } from '../../src/api/handlers';
import * as rpc from '../../src/agentapi/rpc';
import { WebSocketServer } from 'ws';

vi.mock('../../src/agentapi/rpc', () => ({
    callRPC: vi.fn(),
}));

vi.mock('../../src/agentapi/discovery', () => ({
    discoverLanguageServer: vi.fn(() => ({ pid: 1234, httpPort: 8080, httpsPort: 8081, csrfToken: 'token' })),
}));

vi.mock('../../src/auth/tokens', () => ({
    generatePairingToken: vi.fn(() => 'mock-pairing-token'),
}));

vi.mock('../../src/agentapi/stateStream', () => ({
    agentStateStream: {
        connect: vi.fn(),
        on: vi.fn(),
    }
}));

describe('Handlers API', () => {
    let app: express.Express;
    let wss: WebSocketServer;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        wss = new WebSocketServer({ noServer: true });
        setupRoutes(app, wss);
        vi.clearAllMocks();
    });

    it('GET /api/trajectories calls GetAllCascadeTrajectories', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue({
            trajectorySummaries: {
                'uuid-1': {
                    summary: 'Test',
                    stepCount: 1,
                    lastModifiedTime: '2026-06-23T00:00:00Z',
                    workspaceName: 'TestProject',
                    workspaceUri: 'file:///c:/test',
                    status: 'IDLE'
                }
            }
        });

        const res = await request(app).get('/api/trajectories');
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('GetAllCascadeTrajectories');
        expect(res.body[0].projectName).toBe('TestProject');
        expect(res.body[0].conversations[0].id).toBe('uuid-1');
    });

    it('GET /api/models calls GetCascadeModelConfigData', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue({
            clientModelConfigs: [
                { label: 'Model A', modelOrAlias: { model: 'A' }, supportsImages: true }
            ]
        });

        const res = await request(app).get('/api/models');
        expect(res.status).toBe(200);
        expect(res.body[0].label).toBe('Model A');
    });

    it('GET /api/health calls Heartbeat', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue({
            lastExtensionHeartbeat: '2026-06-23T00:00:00Z'
        });

        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.lsRunning).toBe(true);
        expect(res.body.lastHeartbeat).toBe('2026-06-23T00:00:00Z');
    });

    it('GET /api/account calls GetUserStatus and GetProfileData', async () => {
        vi.mocked(rpc.callRPC).mockImplementation(async (method) => {
            if (method === 'GetUserStatus') {
                return {
                    userStatus: {
                        name: 'Test',
                        email: 'test@test.com',
                        planStatus: { planInfo: { planName: 'Pro' } }
                    }
                };
            }
            if (method === 'GetProfileData') {
                return { profilePictureUrl: 'base64' };
            }
        });

        const res = await request(app).get('/api/account');
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Test');
        expect(res.body.email).toBe('test@test.com');
        expect(res.body.plan).toBe('Pro');
        expect(res.body.avatarUrl).toBe('base64');
    });

    // --- PHASE 3 TESTS ---

    it('GET /api/git/state calls GetVersionControlState', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue({ status: 'clean' });
        const res = await request(app).get('/api/git/state?workspaceUri=file:///c:/test');
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('GetVersionControlState', { workspaceUri: 'file:///c:/test' });
        expect(res.body.status).toBe('clean');
    });

    it('GET /api/git/file calls GetVersionControlFileContent', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue({ content: 'code' });
        const res = await request(app).get('/api/git/file?uri=file:///c:/test/file.ts');
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('GetVersionControlFileContent', { uri: 'file:///c:/test/file.ts' });
        expect(res.body.content).toBe('code');
    });

    it('POST /api/git/commit calls GenerateCommitMessage', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue({ message: 'Fix bug' });
        const res = await request(app).post('/api/git/commit').send({ repository: 'repo' });
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('GenerateCommitMessage', { repository: 'repo' });
        expect(res.body.message).toBe('Fix bug');
    });

    it('GET /api/git/diff calls GetWorktreeDiff', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue({ diff: '+1 -1' });
        const res = await request(app).get('/api/git/diff?worktreeDirUri=file:///c:/test');
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('GetWorktreeDiff', { worktreeDirUri: 'file:///c:/test' });
        expect(res.body.diff).toBe('+1 -1');
    });

    it('GET /api/customizations/skills calls GetAllSkills', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue([{ name: 'Skill1' }]);
        const res = await request(app).get('/api/customizations/skills');
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('GetAllSkills');
        expect(res.body[0].name).toBe('Skill1');
    });

    it('GET /api/customizations/plugins calls GetAllPlugins', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue([{ name: 'Plugin1' }]);
        const res = await request(app).get('/api/customizations/plugins');
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('GetAllPlugins');
        expect(res.body[0].name).toBe('Plugin1');
    });

    it('GET /api/customizations/rules calls GetAllRules', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue([{ rule: 'Rule1' }]);
        const res = await request(app).get('/api/customizations/rules');
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('GetAllRules');
        expect(res.body[0].rule).toBe('Rule1');
    });

    it('GET /api/customizations/marketplace calls GetAvailableCascadePlugins', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue([{ name: 'StorePlugin' }]);
        const res = await request(app).get('/api/customizations/marketplace');
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('GetAvailableCascadePlugins');
        expect(res.body[0].name).toBe('StorePlugin');
    });

    it('POST /api/customizations/install calls InstallCascadePlugin', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue({ success: true });
        const res = await request(app).post('/api/customizations/install').send({ pluginId: 'p1' });
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('InstallCascadePlugin', { pluginId: 'p1' });
        expect(res.body.success).toBe(true);
    });

    it('POST /api/customizations/delete calls DeletePlugin', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue({ success: true });
        const res = await request(app).post('/api/customizations/delete').send({ pluginId: 'p1' });
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('DeletePlugin', { pluginId: 'p1' });
        expect(res.body.success).toBe(true);
    });

    it('GET /api/search/code calls SearchCode', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue({ results: ['match'] });
        const res = await request(app).get('/api/search/code?query=foo&workspaceUri=bar');
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('SearchCode', { query: 'foo', workspaceUri: 'bar' });
        expect(res.body.results[0]).toBe('match');
    });

    it('GET /api/search/files calls SearchFiles', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue({ results: ['file.ts'] });
        const res = await request(app).get('/api/search/files?query=foo&workspaceUri=bar');
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('SearchFiles', { query: 'foo', workspaceUri: 'bar' });
        expect(res.body.results[0]).toBe('file.ts');
    });

    it('GET /api/slash-commands calls GetSlashCommands', async () => {
        vi.mocked(rpc.callRPC).mockResolvedValue([{ command: '/test' }]);
        const res = await request(app).get('/api/slash-commands?model=MODEL_CUSTOM');
        expect(res.status).toBe(200);
        expect(rpc.callRPC).toHaveBeenCalledWith('GetSlashCommands', { requestedModel: { model: 'MODEL_CUSTOM' } });
        expect(res.body[0].command).toBe('/test');
    });

    it('GET / returns HTML page with Web Chat', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/html/);
        expect(res.text).toContain('Antigravity Remote Chat');
    });

    it('GET /admin returns HTML page with QR code for localhost requests', async () => {
        const res = await request(app).get('/admin');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/html/);
        expect(res.text).toContain('mock-pairing-token');
        expect(res.text).toContain('<img');
    });
});
