"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupRoutes = setupRoutes;
const express_1 = __importDefault(require("express"));
const parser_1 = require("../history/parser");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const manager_1 = require("../pty/manager");
const sender_1 = require("../agentapi/sender");
const discovery_1 = require("../agentapi/discovery");
const stateStream_1 = require("../agentapi/stateStream");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const https_1 = __importDefault(require("https"));
const rpc_1 = require("../agentapi/rpc");
const cascadeStream_1 = require("../agentapi/cascadeStream");
const GEMINI_DIR = path_1.default.join(os_1.default.homedir(), '.gemini');
const BRAIN_DIR = path_1.default.join(GEMINI_DIR, 'antigravity', 'brain');
function extractTitle(dir, id) {
    const filesToTry = ['task.md', 'walkthrough.md', 'implementation_plan.md'];
    for (const file of filesToTry) {
        try {
            const p = path_1.default.join(dir, file);
            if (fs_1.default.existsSync(p)) {
                const content = fs_1.default.readFileSync(p, 'utf-8');
                const lines = content.split('\n');
                for (let line of lines) {
                    line = line.trim();
                    if (line && line.startsWith('#')) {
                        return line.replace(/^#+\s*/, '').trim();
                    }
                    else if (line) {
                        return line;
                    }
                }
            }
        }
        catch (e) { }
    }
    try {
        const transcriptPath = path_1.default.join(dir, '.system_generated', 'logs', 'transcript.jsonl');
        if (fs_1.default.existsSync(transcriptPath)) {
            const content = fs_1.default.readFileSync(transcriptPath, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const obj = JSON.parse(line);
                        if ((obj.type === 'USER_INPUT' || obj.type === 'SYSTEM') && obj.content) {
                            const textLines = obj.content.split('\n');
                            for (const tLine of textLines) {
                                const cleaned = tLine.replace(/<[^>]+>/g, '').trim();
                                if (cleaned.length > 0 && !cleaned.includes('not actually sent by the user')) {
                                    let title = cleaned;
                                    if (title.length > 50)
                                        title = title.substring(0, 50) + '...';
                                    return title;
                                }
                            }
                        }
                    }
                    catch (e) { }
                }
            }
        }
    }
    catch (e) { }
    return id;
}
function extractSubtitle(dir) {
    try {
        const transcriptPath = path_1.default.join(dir, '.system_generated', 'logs', 'transcript.jsonl');
        if (fs_1.default.existsSync(transcriptPath)) {
            const content = fs_1.default.readFileSync(transcriptPath, 'utf-8');
            const lines = content.split('\n').filter(Boolean);
            for (let i = lines.length - 1; i >= 0; i--) {
                try {
                    const obj = JSON.parse(lines[i]);
                    if ((obj.type === 'USER_INPUT' || obj.type === 'MODEL_RESPONSE') && obj.content) {
                        const textLines = obj.content.split('\n');
                        for (const tLine of textLines) {
                            const cleaned = tLine.replace(/<[^>]+>/g, '').trim();
                            if (cleaned.length > 0 && !cleaned.includes('not actually sent by the user')) {
                                return cleaned;
                            }
                        }
                    }
                }
                catch (e) { }
            }
        }
    }
    catch (e) { }
    return '';
}
let cachedProjectsTree = null;
let lastCacheTime = 0;
async function getCachedProjectsTree() {
    const now = Date.now();
    if (cachedProjectsTree && (now - lastCacheTime < 10000)) {
        return cachedProjectsTree;
    }
    cachedProjectsTree = await getProjectsTree();
    lastCacheTime = now;
    return cachedProjectsTree;
}
async function getProjectsTree() {
    const projectsConfigDir = path_1.default.join(GEMINI_DIR, 'config', 'projects');
    const conversationsDbDir = path_1.default.join(GEMINI_DIR, 'antigravity', 'conversations');
    const projectMap = {};
    if (fs_1.default.existsSync(projectsConfigDir)) {
        const files = fs_1.default.readdirSync(projectsConfigDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const content = fs_1.default.readFileSync(path_1.default.join(projectsConfigDir, file), 'utf-8');
                const data = JSON.parse(content);
                if (data.id && data.name && data.projectResources?.resources?.[0]?.folderUri) {
                    const uri = data.projectResources.resources[0].folderUri;
                    let pPath = uri.replace('file:///', '');
                    pPath = decodeURIComponent(pPath);
                    projectMap[data.id] = { name: data.name, path: pPath };
                }
            }
            catch (e) { }
        }
    }
    const archivedChatsPath = path_1.default.join(conversationsDbDir, 'archived_chats.json');
    let archivedChats = [];
    if (fs_1.default.existsSync(archivedChatsPath)) {
        try {
            archivedChats = JSON.parse(fs_1.default.readFileSync(archivedChatsPath, 'utf-8'));
        }
        catch (e) { }
    }
    // Read real titles from Desktop IDE's protobuf summaries
    const summariesMap = {};
    const summariesPbPath = path_1.default.join(GEMINI_DIR, 'antigravity', 'agyhub_summaries_proto.pb');
    if (fs_1.default.existsSync(summariesPbPath)) {
        try {
            const buf = fs_1.default.readFileSync(summariesPbPath);
            let idx = 0;
            while (idx < buf.length) {
                if (buf[idx] === 0x0a && buf[idx + 1] === 0x24) { // \n$
                    const uuid = buf.toString('ascii', idx + 2, idx + 38);
                    if (/^[a-f0-9\-]{36}$/.test(uuid)) {
                        let tIdx = idx + 38;
                        if (buf[tIdx] === 0x12) {
                            tIdx++;
                            while (buf[tIdx] >= 128)
                                tIdx++;
                            tIdx++;
                            if (buf[tIdx] === 0x0a) {
                                tIdx++;
                                let titleLen = buf[tIdx];
                                if (titleLen < 128) {
                                    tIdx++;
                                    const title = buf.toString('utf8', tIdx, tIdx + titleLen);
                                    if (/^[A-Za-zА-Яа-я0-9]/.test(title)) {
                                        summariesMap[uuid] = title;
                                    }
                                }
                            }
                        }
                    }
                }
                idx++;
            }
        }
        catch (e) {
            console.error('Failed to parse summaries PB:', e);
        }
    }
    const allChats = [];
    if (fs_1.default.existsSync(conversationsDbDir)) {
        const dbs = fs_1.default.readdirSync(conversationsDbDir).filter(f => f.endsWith('.db'));
        for (const dbFile of dbs) {
            const id = dbFile.replace('.db', '');
            if (archivedChats.includes(id))
                continue;
            const dbPath = path_1.default.join(conversationsDbDir, dbFile);
            try {
                const db = new better_sqlite3_1.default(dbPath, { readonly: true });
                const row = db.prepare('SELECT data FROM trajectory_metadata_blob LIMIT 1').get();
                if (row && row.data) {
                    const str = row.data.toString('utf-8');
                    const parentMatch = str.match(/\*\$([a-f0-9\-]{36})/);
                    const parentId = parentMatch ? parentMatch[1] : null;
                    let tempStr = str;
                    if (parentMatch)
                        tempStr = tempStr.replace(parentMatch[0], '');
                    const matches = [...tempStr.matchAll(/\$([a-f0-9\-]{36})/g)];
                    const projectId = matches.length > 0 ? matches[matches.length - 1][1] : null;
                    const dirPath = path_1.default.join(BRAIN_DIR, id);
                    const title = summariesMap[id] || extractTitle(dirPath, id);
                    const subtitle = extractSubtitle(dirPath);
                    const updatedAt = fs_1.default.statSync(dbPath).mtime.getTime();
                    allChats.push({
                        id,
                        projectId,
                        parentId,
                        title,
                        subtitle,
                        subagents: [],
                        updatedAt,
                        stepCount: Math.floor(Math.random() * 50)
                    });
                }
                db.close();
            }
            catch (e) { }
        }
    }
    allChats.sort((a, b) => b.updatedAt - a.updatedAt);
    const projectsDict = {};
    // Initialize with all active projects
    for (const pId in projectMap) {
        projectsDict[pId] = {
            id: pId,
            name: projectMap[pId].name,
            projectName: projectMap[pId].name,
            projectPath: projectMap[pId].path,
            conversations: []
        };
    }
    const chatMap = {};
    for (const chat of allChats) {
        chatMap[chat.id] = chat;
    }
    const topLevelChats = [];
    for (const chat of allChats) {
        if (chat.parentId && chatMap[chat.parentId]) {
            chatMap[chat.parentId].subagents.push(chat);
        }
        else {
            topLevelChats.push(chat);
        }
    }
    for (const chat of topLevelChats) {
        const pId = chat.projectId;
        // If the chat doesn't belong to an active project, ignore it (it's archived or orphaned)
        if (!pId || !projectsDict[pId])
            continue;
        projectsDict[pId].conversations.push(chat);
    }
    const result = Object.values(projectsDict);
    result.forEach((p) => {
        p.conversations.sort((a, b) => b.updatedAt - a.updatedAt);
    });
    result.sort((a, b) => {
        const aMax = a.conversations.length > 0 ? a.conversations[0].updatedAt : 0;
        const bMax = b.conversations.length > 0 ? b.conversations[0].updatedAt : 0;
        return bMax - aMax;
    });
    return result;
}
function transformTrajectoriesToProjectTree(summaries) {
    const projects = new Map();
    const conversationsDbDir = path_1.default.join(GEMINI_DIR, 'antigravity', 'conversations');
    const archivedChatsPath = path_1.default.join(conversationsDbDir, 'archived_chats.json');
    let archivedChats = new Set();
    if (fs_1.default.existsSync(archivedChatsPath)) {
        try {
            archivedChats = new Set(JSON.parse(fs_1.default.readFileSync(archivedChatsPath, 'utf-8')));
        }
        catch (e) { }
    }
    for (const [convId, traj] of Object.entries(summaries)) {
        if (archivedChats.has(convId))
            continue;
        const projectName = decodeURIComponent(traj.workspaceName || 'Unknown');
        if (!projects.has(projectName)) {
            projects.set(projectName, {
                id: projectName,
                name: projectName,
                projectName,
                projectPath: traj.workspaceUri || '',
                conversations: [],
            });
        }
        projects.get(projectName).conversations.push({
            id: convId,
            projectId: projectName,
            parentId: null,
            title: traj.summary?.substring(0, 100) || 'New Chat',
            subtitle: `${traj.stepCount} steps`,
            updatedAt: traj.lastModifiedTime ? new Date(traj.lastModifiedTime).getTime() : 0,
            status: traj.status,
            subagents: [],
        });
    }
    return [...projects.values()]
        .map(p => ({
        ...p,
        conversations: p.conversations.sort((a, b) => b.updatedAt - a.updatedAt),
    }))
        .sort((a, b) => {
        const aTime = a.conversations[0]?.updatedAt || 0;
        const bTime = b.conversations[0]?.updatedAt || 0;
        return bTime - aTime;
    });
}
const multer_1 = __importDefault(require("multer"));
// Configure multer to save files in a temporary directory or directly to the target conversation if possible.
// We'll use memory storage and write it manually to the right place so we can use conversationId.
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
const cascadeStreams = new Map();
function setupRoutes(app, wss) {
    // Serve APK for easy Wi-Fi installation
    app.use('/download-apk', express_1.default.static(path_1.default.join(__dirname, '../../../android/app/build/outputs/apk/debug')));
    // Start listening to agent state updates
    stateStream_1.agentStateStream.connect();
    stateStream_1.agentStateStream.on('state', (stateObj) => {
        const payload = JSON.stringify({ type: 'AGENT_STATE', data: stateObj });
        wss.clients.forEach(client => {
            if (client.readyState === 1) { // 1 = OPEN
                client.send(payload);
            }
        });
    });
    // REST: Check Language Server status (is Antigravity running?)
    app.get('/api/ls-status', (req, res) => {
        const discovery = (0, discovery_1.discoverLanguageServer)(true);
        if (discovery) {
            res.json({
                available: true,
                pid: discovery.pid,
                port: discovery.httpPort,
                method: 'agentapi',
            });
        }
        else {
            res.json({
                available: false,
                method: 'file-fallback',
                warning: 'Language Server not found. Messages will be queued but agent won\'t wake automatically.',
            });
        }
    });
    app.get('/api/trajectories', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('GetAllCascadeTrajectories');
            const tree = transformTrajectoriesToProjectTree(data.trajectorySummaries || {});
            res.json(tree);
        }
        catch (err) {
            const tree = await getCachedProjectsTree();
            res.json(tree);
        }
    });
    app.get('/api/models', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('GetCascadeModelConfigData');
            res.json(data.clientModelConfigs || []);
        }
        catch (err) {
            res.status(503).json({ error: 'Language Server unavailable' });
        }
    });
    app.get('/api/model-usage', async (req, res) => {
        res.json([
            { model: "Gemini 3.1 Pro (High)", calls: 342 },
            { model: "Claude 3.5 Sonnet", calls: 120 }
        ]);
    });
    // Read server version for health endpoint
    let serverVersion = '2.0.0';
    try {
        const pkg = JSON.parse(fs_1.default.readFileSync(path_1.default.join(__dirname, '../../package.json'), 'utf-8'));
        if (pkg.version)
            serverVersion = pkg.version;
    }
    catch { }
    app.get('/api/health', async (req, res) => {
        try {
            const heartbeat = await (0, rpc_1.callRPC)('Heartbeat', {}, { timeoutMs: 2000 });
            const ls = (0, discovery_1.discoverLanguageServer)();
            res.json({
                ok: true,
                lsRunning: !!ls,
                lastHeartbeat: heartbeat.lastExtensionHeartbeat,
                pid: ls?.pid,
                version: serverVersion,
            });
        }
        catch {
            res.json({ ok: true, lsRunning: false, version: serverVersion });
        }
    });
    app.get('/api/account', async (req, res) => {
        try {
            const [userStatus, profile] = await Promise.all([
                (0, rpc_1.callRPC)('GetUserStatus', {}, { timeoutMs: 3000 }),
                (0, rpc_1.callRPC)('GetProfileData', {}, { timeoutMs: 3000 }),
            ]);
            res.json({
                name: userStatus.userStatus?.name,
                email: userStatus.userStatus?.email,
                plan: userStatus.userStatus?.planStatus?.planInfo?.planName,
                monthlyPromptCredits: userStatus.userStatus?.planStatus?.planInfo?.monthlyPromptCredits,
                monthlyFlowCredits: userStatus.userStatus?.planStatus?.planInfo?.monthlyFlowCredits,
                avatarUrl: profile.profilePictureUrl,
            });
        }
        catch (err) {
            res.status(503).json({ error: 'Failed to get account info' });
        }
    });
    app.get('/api/mcp', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('GetMcpServerStates');
            res.json(data.states || []);
        }
        catch (err) {
            res.status(503).json({ error: 'Failed to get MCP states' });
        }
    });
    app.post('/api/mcp/toggle', async (req, res) => {
        try {
            const { serverName } = req.body;
            await (0, rpc_1.callRPC)('ToggleMcpServer', { serverName });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/mcp/refresh', async (req, res) => {
        try {
            await (0, rpc_1.callRPC)('RefreshMcpServers');
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/search', async (req, res) => {
        const query = req.query.q;
        console.log('[Search] Received query:', JSON.stringify(query));
        if (!query)
            return res.json([]);
        try {
            const lowerQuery = query.toLowerCase();
            const projects = await getCachedProjectsTree();
            const results = [];
            function searchConv(conv) {
                if (conv.title?.toLowerCase().includes(lowerQuery) ||
                    conv.subtitle?.toLowerCase().includes(lowerQuery)) {
                    results.push({
                        cascadeId: conv.id,
                        title: conv.title,
                        snippet: conv.subtitle || ''
                    });
                }
                if (conv.subagents && Array.isArray(conv.subagents)) {
                    for (const sub of conv.subagents) {
                        searchConv(sub);
                    }
                }
            }
            for (const project of projects) {
                if (project.conversations) {
                    for (const conv of project.conversations) {
                        searchConv(conv);
                    }
                }
            }
            res.json(results);
        }
        catch (err) {
            res.status(503).json({ error: 'Search unavailable' });
        }
    });
    app.get('/api/turn-diff/:conversationId', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('GetTurnDiff', {
                conversationId: req.params.conversationId
            });
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/files', async (req, res) => {
        const uri = req.query.uri;
        try {
            const data = await (0, rpc_1.callRPC)('ReadDir', { uri });
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/file', async (req, res) => {
        const uri = req.query.uri;
        try {
            const data = await (0, rpc_1.callRPC)('ReadFile', { uri });
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // --- PHASE 3 ---
    // GIT Endpoints
    app.get('/api/git/state', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('GetVersionControlState', { workspaceUri: req.query.workspaceUri });
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/git/file', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('GetVersionControlFileContent', { uri: req.query.uri });
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/git/commit', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('GenerateCommitMessage', { repository: req.body.repository });
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/git/diff', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('GetWorktreeDiff', { worktreeDirUri: req.query.worktreeDirUri });
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Customization Endpoints
    app.get('/api/customizations/skills', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('GetAllSkills');
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/customizations/plugins', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('GetAllPlugins');
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/customizations/rules', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('GetAllRules');
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/customizations/marketplace', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('GetAvailableCascadePlugins');
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/customizations/install', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('InstallCascadePlugin', { pluginId: req.body.pluginId });
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.post('/api/customizations/delete', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('DeletePlugin', { pluginId: req.body.pluginId });
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Search Endpoints
    app.get('/api/search/code', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('SearchCode', { query: req.query.query, workspaceUri: req.query.workspaceUri });
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    app.get('/api/search/files', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('SearchFiles', { query: req.query.query, workspaceUri: req.query.workspaceUri });
            res.json(data);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // Slash commands
    app.get('/api/slash-commands', async (req, res) => {
        try {
            const data = await (0, rpc_1.callRPC)('GetSlashCommands', {
                requestedModel: { model: req.query.model || 'MODEL_CHAT_20706' }
            });
            res.json(data);
        }
        catch (err) {
            res.status(503).json({ error: 'Unavailable' });
        }
    });
    // REST: Upload image to a conversation
    app.post('/api/upload', upload.single('image'), (req, res) => {
        try {
            const conversationId = req.body.conversationId;
            if (!conversationId) {
                return res.status(400).json({ error: 'conversationId is required' });
            }
            if (!req.file) {
                return res.status(400).json({ error: 'image file is required' });
            }
            const ext = path_1.default.extname(req.file.originalname) || '.png';
            const timestamp = Date.now();
            const filename = `uploaded_media_${timestamp}${ext}`;
            const targetDir = path_1.default.join(BRAIN_DIR, conversationId);
            if (!fs_1.default.existsSync(targetDir)) {
                fs_1.default.mkdirSync(targetDir, { recursive: true });
            }
            const targetPath = path_1.default.join(targetDir, filename);
            fs_1.default.writeFileSync(targetPath, req.file.buffer);
            // Construct Markdown image string. The Antigravity IDE expects the format:
            // ![alt_text](file:///C:/absolute/path)
            // On Windows, the path needs proper URI formatting for file:///
            const absoluteUri = `file:///${targetPath.replace(/\\/g, '/')}`;
            const markdown = `![uploaded image](${absoluteUri})`;
            res.json({ success: true, markdown, path: targetPath });
        }
        catch (error) {
            console.error('[Upload] Error saving image:', error);
            res.status(500).json({ error: 'Failed to save image' });
        }
    });
    // REST: Get available projects
    app.get('/api/projects', async (req, res) => {
        try {
            const projects = await getCachedProjectsTree();
            res.json(projects);
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    // REST: Archive chat
    app.post('/api/archive', (req, res) => {
        try {
            const { conversationId } = req.body;
            if (!conversationId)
                return res.status(400).json({ error: 'conversationId is required' });
            const conversationsDbDir = path_1.default.join(GEMINI_DIR, 'antigravity', 'conversations');
            const archivedChatsPath = path_1.default.join(conversationsDbDir, 'archived_chats.json');
            let archivedChats = [];
            if (fs_1.default.existsSync(archivedChatsPath)) {
                try {
                    archivedChats = JSON.parse(fs_1.default.readFileSync(archivedChatsPath, 'utf-8'));
                }
                catch (e) { }
            }
            if (!archivedChats.includes(conversationId)) {
                archivedChats.push(conversationId);
                fs_1.default.writeFileSync(archivedChatsPath, JSON.stringify(archivedChats));
            }
            res.json({ success: true });
        }
        catch (e) {
            res.status(500).json({ error: String(e) });
        }
    });
    // REST: Serve artifact files
    app.get('/api/artifact', (req, res) => {
        try {
            const filePath = req.query.path;
            if (!filePath) {
                return res.status(400).json({ error: 'path is required' });
            }
            const normalizedPath = path_1.default.normalize(filePath);
            // Security check: must be inside BRAIN_DIR
            if (!normalizedPath.startsWith(BRAIN_DIR)) {
                return res.status(403).json({ error: 'Access denied' });
            }
            if (!fs_1.default.existsSync(normalizedPath)) {
                return res.status(404).json({ error: 'File not found' });
            }
            res.sendFile(normalizedPath, { dotfiles: 'allow' });
        }
        catch (error) {
            console.error('[Artifact] Error serving file:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    // REST: Get project history
    app.get('/api/history', async (req, res) => {
        const conversationId = req.query.conversationId;
        if (!conversationId) {
            res.status(400).json({ error: 'conversationId is required' });
            return;
        }
        try {
            const history = await (0, parser_1.readTranscript)(conversationId);
            res.json({ history });
        }
        catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });
    // WEBSOCKET: Real-time interactions
    wss.on('connection', (ws) => {
        console.log('[WebSocket] Client connected');
        let currentPtyProcess = null;
        ws.on('message', async (message) => {
            try {
                const msg = JSON.parse(message.toString());
                console.log('[WebSocket] Received:', msg);
                if (msg.type === 'START_AGENT') {
                    const projectPath = msg.projectPath;
                    if (currentPtyProcess) {
                        (0, manager_1.killAntigravity)(currentPtyProcess);
                    }
                    currentPtyProcess = (0, manager_1.spawnAntigravity)(projectPath, ws);
                }
                else if (msg.type === 'SEND_INPUT') {
                    if (currentPtyProcess) {
                        currentPtyProcess.write(msg.data + '\r');
                    }
                    else if (msg.conversationId) {
                        const conversationId = msg.conversationId;
                        try {
                            const result = await (0, sender_1.sendMessage)(conversationId, msg.data, msg.model);
                            if (result.success) {
                                if (result.newConvId) {
                                    ws.send(JSON.stringify({ type: 'CHAT_CREATED', oldId: msg.conversationId, newId: result.newConvId }));
                                }
                                ws.send(JSON.stringify({
                                    type: 'EVENT',
                                    data: `Message delivered via ${result.method}`
                                }));
                            }
                            else {
                                ws.send(JSON.stringify({
                                    type: 'ERROR',
                                    error: `Failed to send: ${result.error}`
                                }));
                            }
                        }
                        catch (err) {
                            console.error('[WebSocket] Error sending message:', err);
                            ws.send(JSON.stringify({
                                type: 'ERROR',
                                error: `Send failed: ${err}`
                            }));
                        }
                    }
                }
                else if (msg.type === 'APPROVE_INTERACTION' || msg.type === 'REJECT_INTERACTION') {
                    if (msg.conversationId && msg.interactionPayload) {
                        const isApprove = msg.type === 'APPROVE_INTERACTION';
                        let finalInteraction = msg.interactionPayload;
                        if (!isApprove) {
                            // Deny Interaction logic
                            const COMMON = new Set(['trajectoryId', 'stepIndex', 'timedOut']);
                            const out = {};
                            for (const [key, val] of Object.entries(finalInteraction)) {
                                if (COMMON.has(key) || val === null || typeof val !== 'object') {
                                    out[key] = val;
                                    continue;
                                }
                                if (key === 'filePermission') {
                                    out[key] = { absolutePathUri: val.absolutePathUri };
                                    continue;
                                }
                                const member = { ...val };
                                if ('confirm' in member)
                                    member.confirm = false;
                                if ('allow' in member)
                                    member.allow = false;
                                if ('cancel' in member)
                                    member.cancel = true;
                                if ('cancelled' in member)
                                    member.cancelled = true;
                                out[key] = member;
                            }
                            finalInteraction = out;
                        }
                        const body = {
                            cascadeId: msg.conversationId,
                            interaction: finalInteraction
                        };
                        const ls = (0, discovery_1.discoverLanguageServer)();
                        if (ls) {
                            const req = https_1.default.request({
                                hostname: 'localhost',
                                port: ls.httpsPort,
                                path: '/exa.language_server_pb.LanguageServerService/HandleCascadeUserInteraction',
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Connect-Protocol-Version': '1',
                                    'X-Codeium-Csrf-Token': ls.csrfToken
                                },
                                rejectUnauthorized: false
                            }, (res) => {
                                console.log(`[Interaction] ${isApprove ? 'Approved' : 'Rejected'}, status=${res.statusCode}`);
                            });
                            req.on('error', (e) => console.error('[Interaction] Error:', e));
                            req.write(JSON.stringify(body));
                            req.end();
                        }
                        else {
                            console.error('[Interaction] No Language Server found to handle interaction');
                        }
                    }
                }
                else if (msg.type === 'KILL') {
                    if (currentPtyProcess) {
                        (0, manager_1.killAntigravity)(currentPtyProcess);
                        currentPtyProcess = null;
                        ws.send(JSON.stringify({ type: 'EVENT', data: 'Process killed by user' }));
                    }
                }
                else if (msg.type === 'LIST_CONVERSATIONS_V2') {
                    try {
                        const data = await (0, rpc_1.callRPC)('GetAllCascadeTrajectories');
                        const tree = transformTrajectoriesToProjectTree(data.trajectorySummaries || {});
                        ws.send(JSON.stringify({ type: 'CONVERSATIONS_LIST', data: tree }));
                    }
                    catch (err) {
                        try {
                            const tree = await getProjectsTree();
                            ws.send(JSON.stringify({ type: 'CONVERSATIONS_LIST', data: tree }));
                        }
                        catch (fallbackErr) {
                            console.error('[WebSocket] Error in LIST_CONVERSATIONS_V2 fallback:', fallbackErr);
                            ws.send(JSON.stringify({ type: 'ERROR', error: String(fallbackErr) }));
                        }
                    }
                }
                else if (msg.type === 'GET_MODELS') {
                    try {
                        const data = await (0, rpc_1.callRPC)('GetCascadeModelConfigData');
                        ws.send(JSON.stringify({ type: 'MODELS_LIST', data: data.clientModelConfigs || [] }));
                    }
                    catch (err) {
                        ws.send(JSON.stringify({ type: 'ERROR', error: 'Failed to get models' }));
                    }
                }
                else if (msg.type === 'STOP_AGENT') {
                    try {
                        const { conversationId } = msg;
                        await (0, rpc_1.callRPC)('ForceStopCascadeTree', { conversationId });
                        ws.send(JSON.stringify({ type: 'EVENT', data: 'Agent stopped' }));
                    }
                    catch (err) {
                        ws.send(JSON.stringify({ type: 'ERROR', error: `Failed to stop: ${err.message}` }));
                    }
                }
                else if (msg.type === 'FORK_CONVERSATION') {
                    try {
                        const { conversationId } = msg;
                        const data = await (0, rpc_1.callRPC)('ForkConversation', { sourceCascadeId: conversationId });
                        ws.send(JSON.stringify({ type: 'FORK_RESULT', data }));
                    }
                    catch (err) {
                        ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
                    }
                }
                else if (msg.type === 'LIST_CONVERSATIONS') {
                    try {
                        const data = await getProjectsTree();
                        ws.send(JSON.stringify({ type: 'CONVERSATIONS_LIST', data }));
                    }
                    catch (err) {
                        console.error('[WebSocket] Error in LIST_CONVERSATIONS:', err);
                        ws.send(JSON.stringify({ type: 'ERROR', error: String(err) }));
                    }
                }
                else if (msg.type === 'GET_TRANSCRIPT') {
                    try {
                        const id = msg.id;
                        const logFile = path_1.default.join(BRAIN_DIR, id, '.system_generated', 'logs', 'transcript.jsonl');
                        if (fs_1.default.existsSync(logFile)) {
                            const content = fs_1.default.readFileSync(logFile, 'utf-8');
                            const lines = content.split('\n');
                            const allMsgs = [];
                            for (const line of lines) {
                                if (line.trim()) {
                                    try {
                                        allMsgs.push(JSON.parse(line));
                                    }
                                    catch (e) { }
                                }
                            }
                            const limit = msg.limit || 50;
                            const offset = msg.offset || 0;
                            const endIdx = allMsgs.length - offset;
                            const startIdx = Math.max(0, endIdx - limit);
                            if (startIdx < endIdx) {
                                const chunk = allMsgs.slice(startIdx, endIdx);
                                ws.send(JSON.stringify({ type: 'TRANSCRIPT_DATA', data: chunk, offset: offset + chunk.length, hasMore: startIdx > 0, isPagination: offset > 0 }));
                            }
                            else {
                                ws.send(JSON.stringify({ type: 'TRANSCRIPT_DATA', data: [], offset, hasMore: false, isPagination: offset > 0 }));
                            }
                        }
                        else {
                            ws.send(JSON.stringify({ type: 'ERROR', error: 'Transcript not found' }));
                        }
                    }
                    catch (err) {
                        console.error('[WebSocket] Error in GET_TRANSCRIPT:', err);
                        ws.send(JSON.stringify({ type: 'ERROR', error: String(err) }));
                    }
                    // Setup real-time watching
                    const conversationId = msg.id;
                    if (!cascadeStreams.has(conversationId)) {
                        const stream = new cascadeStream_1.CascadeReactiveStream(conversationId);
                        stream.on('update', (data) => {
                            ws.send(JSON.stringify({ type: 'CASCADE_UPDATE', data }));
                        });
                        stream.connect();
                        cascadeStreams.set(conversationId, stream);
                    }
                    if (!msg.offset) {
                        try {
                            const id = msg.id;
                            const logFile = path_1.default.join(BRAIN_DIR, id, '.system_generated', 'logs', 'transcript.jsonl');
                            if (fs_1.default.existsSync(logFile)) {
                                if (ws.transcriptWatcher) {
                                    ws.transcriptWatcher.close();
                                }
                                let currentSize = fs_1.default.statSync(logFile).size;
                                ws.transcriptWatcher = fs_1.default.watch(logFile, (eventType, filename) => {
                                    try {
                                        const newSize = fs_1.default.statSync(logFile).size;
                                        if (newSize > currentSize) {
                                            const fd = fs_1.default.openSync(logFile, 'r');
                                            const buffer = Buffer.alloc(newSize - currentSize);
                                            fs_1.default.readSync(fd, buffer, 0, newSize - currentSize, currentSize);
                                            fs_1.default.closeSync(fd);
                                            currentSize = newSize;
                                            const newContent = buffer.toString('utf-8');
                                            const lines = newContent.split('\n');
                                            const newMessages = [];
                                            for (const line of lines) {
                                                if (line.trim()) {
                                                    try {
                                                        const parsed = JSON.parse(line);
                                                        newMessages.push(parsed);
                                                    }
                                                    catch (e) { }
                                                }
                                            }
                                            if (newMessages.length > 0) {
                                                ws.send(JSON.stringify({ type: 'TRANSCRIPT_DATA', data: newMessages }));
                                            }
                                        }
                                    }
                                    catch (e) {
                                        // ignore read errors
                                    }
                                });
                            }
                        }
                        catch (err) { }
                    }
                }
            }
            catch (err) {
                console.error('[WebSocket] Error processing message', err);
            }
        });
        ws.on('close', () => {
            console.log('[WebSocket] Client disconnected');
            if (currentPtyProcess) {
                (0, manager_1.killAntigravity)(currentPtyProcess);
            }
            if (ws.transcriptWatcher) {
                ws.transcriptWatcher.close();
            }
        });
    });
}
