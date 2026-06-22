"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupRoutes = setupRoutes;
const parser_1 = require("../history/parser");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const manager_1 = require("../pty/manager");
const sender_1 = require("../agentapi/sender");
const discovery_1 = require("../agentapi/discovery");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
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
                        updatedAt
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
const multer_1 = __importDefault(require("multer"));
// Configure multer to save files in a temporary directory or directly to the target conversation if possible.
// We'll use memory storage and write it manually to the right place so we can use conversationId.
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
function setupRoutes(app, wss) {
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
            const projects = await getProjectsTree();
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
                            const result = await (0, sender_1.sendMessage)(conversationId, msg.data);
                            if (result.success) {
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
                else if (msg.type === 'KILL') {
                    if (currentPtyProcess) {
                        (0, manager_1.killAntigravity)(currentPtyProcess);
                        currentPtyProcess = null;
                        ws.send(JSON.stringify({ type: 'EVENT', data: 'Process killed by user' }));
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
