import { Express, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { getProjects } from '../scanner/projects';
import { readTranscript } from '../history/parser';
import Database from 'better-sqlite3';
import { spawnAntigravity, killAntigravity } from '../pty/manager';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BRAIN_DIR = 'C:\\Users\\Michael Sumaneev\\.gemini\\antigravity\\brain';

function extractTitle(dir: string, id: string): string {
    const filesToTry = ['task.md', 'walkthrough.md', 'implementation_plan.md'];
    for (const file of filesToTry) {
        try {
            const p = path.join(dir, file);
            if (fs.existsSync(p)) {
                const content = fs.readFileSync(p, 'utf-8');
                const lines = content.split('\n');
                for (let line of lines) {
                    line = line.trim();
                    if (line && line.startsWith('#')) {
                        return line.replace(/^#+\s*/, '').trim();
                    } else if (line) {
                        return line;
                    }
                }
            }
        } catch (e) {}
    }
    
    try {
        const transcriptPath = path.join(dir, '.system_generated', 'logs', 'transcript.jsonl');
        if (fs.existsSync(transcriptPath)) {
            const content = fs.readFileSync(transcriptPath, 'utf-8');
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
                                    if (title.length > 50) title = title.substring(0, 50) + '...';
                                    return title;
                                }
                            }
                        }
                    } catch(e) {}
                }
            }
        }
    } catch (e) {}

    return id;
}

function extractSubtitle(dir: string): string {
    try {
        const transcriptPath = path.join(dir, '.system_generated', 'logs', 'transcript.jsonl');
        if (fs.existsSync(transcriptPath)) {
            const content = fs.readFileSync(transcriptPath, 'utf-8');
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
                } catch(e) {}
            }
        }
    } catch (e) {}
    return '';
}

async function getProjectsTree() {
    const projectsConfigDir = 'C:\\Users\\Michael Sumaneev\\.gemini\\config\\projects';
    const conversationsDbDir = 'C:\\Users\\Michael Sumaneev\\.gemini\\antigravity\\conversations';
    
    const projectMap: Record<string, { name: string, path: string }> = {};
    if (fs.existsSync(projectsConfigDir)) {
        const files = fs.readdirSync(projectsConfigDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(projectsConfigDir, file), 'utf-8');
                const data = JSON.parse(content);
                if (data.id && data.name && data.projectResources?.resources?.[0]?.folderUri) {
                    const uri = data.projectResources.resources[0].folderUri;
                    let pPath = uri.replace('file:///', '');
                    pPath = decodeURIComponent(pPath);
                    projectMap[data.id] = { name: data.name, path: pPath };
                }
            } catch(e) {}
        }
    }
    
    const archivedChatsPath = path.join(conversationsDbDir, 'archived_chats.json');
    let archivedChats: string[] = [];
    if (fs.existsSync(archivedChatsPath)) {
        try {
            archivedChats = JSON.parse(fs.readFileSync(archivedChatsPath, 'utf-8'));
        } catch(e) {}
    }
    
    // Read real titles from Desktop IDE's protobuf summaries
    const summariesMap: Record<string, string> = {};
    const summariesPbPath = 'C:\\Users\\Michael Sumaneev\\.gemini\\antigravity\\agyhub_summaries_proto.pb';
    if (fs.existsSync(summariesPbPath)) {
        try {
            const buf = fs.readFileSync(summariesPbPath);
            let idx = 0;
            while (idx < buf.length) {
                if (buf[idx] === 0x0a && buf[idx+1] === 0x24) { // \n$
                    const uuid = buf.toString('ascii', idx+2, idx+38);
                    if (/^[a-f0-9\-]{36}$/.test(uuid)) {
                        let tIdx = idx + 38;
                        if (buf[tIdx] === 0x12) {
                            tIdx++;
                            while(buf[tIdx] >= 128) tIdx++;
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
        } catch(e) {
            console.error('Failed to parse summaries PB:', e);
        }
    }
    
    const allChats: any[] = [];
    if (fs.existsSync(conversationsDbDir)) {
        const dbs = fs.readdirSync(conversationsDbDir).filter(f => f.endsWith('.db'));
        for (const dbFile of dbs) {
            const id = dbFile.replace('.db', '');
            if (archivedChats.includes(id)) continue;
            
            const dbPath = path.join(conversationsDbDir, dbFile);
            try {
                const db = new Database(dbPath, { readonly: true });
                const row = db.prepare('SELECT data FROM trajectory_metadata_blob LIMIT 1').get() as any;
                if (row && row.data) {
                    const str = row.data.toString('utf-8');
                    const parentMatch = str.match(/\*\$([a-f0-9\-]{36})/);
                    const parentId = parentMatch ? parentMatch[1] : null;
                    
                    let tempStr = str;
                    if (parentMatch) tempStr = tempStr.replace(parentMatch[0], '');
                    const matches = [...tempStr.matchAll(/\$([a-f0-9\-]{36})/g)];
                    const projectId = matches.length > 0 ? matches[matches.length - 1][1] : null;
                    
                    const dirPath = path.join(BRAIN_DIR, id);
                    const title = summariesMap[id] || extractTitle(dirPath, id);
                    const subtitle = extractSubtitle(dirPath);
                    const updatedAt = fs.statSync(dbPath).mtime.getTime();
                    
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
            } catch(e) {}
        }
    }
    
    allChats.sort((a, b) => b.updatedAt - a.updatedAt);

    const projectsDict: Record<string, any> = {};
    
    // Initialize with all active projects
    for (const pId in projectMap) {
        projectsDict[pId] = {
            projectName: projectMap[pId].name,
            projectPath: projectMap[pId].path,
            conversations: []
        };
    }

    const chatMap: Record<string, any> = {};
    
    for (const chat of allChats) {
        chatMap[chat.id] = chat;
    }
    
    const topLevelChats: any[] = [];
    for (const chat of allChats) {
        if (chat.parentId && chatMap[chat.parentId]) {
            chatMap[chat.parentId].subagents.push(chat);
        } else {
            topLevelChats.push(chat);
        }
    }
    
    for (const chat of topLevelChats) {
        const pId = chat.projectId;
        // If the chat doesn't belong to an active project, ignore it (it's archived or orphaned)
        if (!pId || !projectsDict[pId]) continue;
        
        projectsDict[pId].conversations.push(chat);
    }
    
    const result = Object.values(projectsDict);
    result.forEach((p: any) => {
        p.conversations.sort((a: any, b: any) => b.updatedAt - a.updatedAt);
    });
    result.sort((a: any, b: any) => {
        const aMax = a.conversations.length > 0 ? a.conversations[0].updatedAt : 0;
        const bMax = b.conversations.length > 0 ? b.conversations[0].updatedAt : 0;
        return bMax - aMax;
    });
    
    return result;
}

import multer from 'multer';

// Configure multer to save files in a temporary directory or directly to the target conversation if possible.
// We'll use memory storage and write it manually to the right place so we can use conversationId.
const upload = multer({ storage: multer.memoryStorage() });

export function setupRoutes(app: Express, wss: WebSocketServer) {
    // REST: Upload image to a conversation
    app.post('/api/upload', upload.single('image'), (req: Request, res: Response) => {
        try {
            const conversationId = req.body.conversationId;
            if (!conversationId) {
                return res.status(400).json({ error: 'conversationId is required' });
            }
            if (!req.file) {
                return res.status(400).json({ error: 'image file is required' });
            }

            const ext = path.extname(req.file.originalname) || '.png';
            const timestamp = Date.now();
            const filename = `uploaded_media_${timestamp}${ext}`;
            const targetDir = path.join(BRAIN_DIR, conversationId);
            
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            
            const targetPath = path.join(targetDir, filename);
            fs.writeFileSync(targetPath, req.file.buffer);

            // Construct Markdown image string. The Antigravity IDE expects the format:
            // ![alt_text](file:///C:/absolute/path)
            // On Windows, the path needs proper URI formatting for file:///
            const absoluteUri = `file:///${targetPath.replace(/\\/g, '/')}`;
            const markdown = `![uploaded image](${absoluteUri})`;

            res.json({ success: true, markdown, path: targetPath });
        } catch (error) {
            console.error('[Upload] Error saving image:', error);
            res.status(500).json({ error: 'Failed to save image' });
        }
    });

    // REST: Get available projects
    app.get('/api/projects', async (req: Request, res: Response) => {
        try {
            const projects = await getProjectsTree();
            res.json(projects);
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    // REST: Archive chat
    app.post('/api/archive', (req: Request, res: Response) => {
        try {
            const { conversationId } = req.body;
            if (!conversationId) return res.status(400).json({ error: 'conversationId is required' });
            
            const conversationsDbDir = 'C:\\Users\\Michael Sumaneev\\.gemini\\antigravity\\conversations';
            const archivedChatsPath = path.join(conversationsDbDir, 'archived_chats.json');
            let archivedChats: string[] = [];
            if (fs.existsSync(archivedChatsPath)) {
                try {
                    archivedChats = JSON.parse(fs.readFileSync(archivedChatsPath, 'utf-8'));
                } catch(e) {}
            }
            if (!archivedChats.includes(conversationId)) {
                archivedChats.push(conversationId);
                fs.writeFileSync(archivedChatsPath, JSON.stringify(archivedChats));
            }
            res.json({ success: true });
        } catch(e) {
            res.status(500).json({ error: String(e) });
        }
    });

    // REST: Serve artifact files
    app.get('/api/artifact', (req: Request, res: Response) => {
        try {
            const filePath = req.query.path as string;
            if (!filePath) {
                return res.status(400).json({ error: 'path is required' });
            }

            const normalizedPath = path.normalize(filePath);
            
            // Security check: must be inside BRAIN_DIR
            if (!normalizedPath.startsWith(BRAIN_DIR)) {
                return res.status(403).json({ error: 'Access denied' });
            }

            if (!fs.existsSync(normalizedPath)) {
                return res.status(404).json({ error: 'File not found' });
            }

            res.sendFile(normalizedPath, { dotfiles: 'allow' });
        } catch (error) {
            console.error('[Artifact] Error serving file:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });

    // REST: Get project history
    app.get('/api/history', async (req: Request, res: Response) => {
        const conversationId = req.query.conversationId as string;
        if (!conversationId) {
             res.status(400).json({ error: 'conversationId is required' });
             return;
        }
        
        try {
            const history = await readTranscript(conversationId);
            res.json({ history });
        } catch (error) {
            res.status(500).json({ error: String(error) });
        }
    });

    // WEBSOCKET: Real-time interactions
    wss.on('connection', (ws: WebSocket) => {
        console.log('[WebSocket] Client connected');
        let currentPtyProcess: any = null;

        ws.on('message', async (message: Buffer) => {
            try {
                const msg = JSON.parse(message.toString());
                console.log('[WebSocket] Received:', msg);

                if (msg.type === 'START_AGENT') {
                    const projectPath = msg.projectPath;
                    if (currentPtyProcess) {
                        killAntigravity(currentPtyProcess);
                    }
                    currentPtyProcess = spawnAntigravity(projectPath, ws);
                } else if (msg.type === 'SEND_INPUT') {
                    if (currentPtyProcess) {
                        currentPtyProcess.write(msg.data + '\r');
                    } else if (msg.conversationId) {
                        const conversationId = msg.conversationId;
                        const inboxDir = path.join(BRAIN_DIR, conversationId, 'inbox');
                        if (!fs.existsSync(inboxDir)) {
                            fs.mkdirSync(inboxDir, { recursive: true });
                        }
                        const timestamp = Date.now();
                        const msgPath = path.join(inboxDir, `msg_phone_${timestamp}.txt`);
                        const content = `[Сообщение с телефона]: ${msg.data.trim()}`;
                        fs.writeFileSync(msgPath, content, 'utf8');
                    }
                } else if (msg.type === 'KILL') {
                    if (currentPtyProcess) {
                        killAntigravity(currentPtyProcess);
                        currentPtyProcess = null;
                        ws.send(JSON.stringify({ type: 'EVENT', data: 'Process killed by user' }));
                    }
                } else if (msg.type === 'LIST_CONVERSATIONS') {
                    try {
                        const data = await getProjectsTree();
                        ws.send(JSON.stringify({ type: 'CONVERSATIONS_LIST', data }));
                    } catch (err) {
                        console.error('[WebSocket] Error in LIST_CONVERSATIONS:', err);
                        ws.send(JSON.stringify({ type: 'ERROR', error: String(err) }));
                    }
                } else if (msg.type === 'GET_TRANSCRIPT') {
                    try {
                        const id = msg.id;
                        const logFile = path.join(BRAIN_DIR, id, '.system_generated', 'logs', 'transcript.jsonl');
                        if (fs.existsSync(logFile)) {
                            const content = fs.readFileSync(logFile, 'utf-8');
                            const lines = content.split('\n');
                            let currentChunk = [];
                            for (const line of lines) {
                                if (line.trim()) {
                                    try {
                                        currentChunk.push(JSON.parse(line));
                                        if (currentChunk.length >= 50) {
                                            ws.send(JSON.stringify({ type: 'TRANSCRIPT_DATA', data: currentChunk }));
                                            currentChunk = [];
                                        }
                                    } catch(e) {}
                                }
                            }
                            if (currentChunk.length > 0) {
                                ws.send(JSON.stringify({ type: 'TRANSCRIPT_DATA', data: currentChunk }));
                            }
                        } else {
                            ws.send(JSON.stringify({ type: 'ERROR', error: 'Transcript not found' }));
                        }
                    } catch (err) {
                        console.error('[WebSocket] Error in GET_TRANSCRIPT:', err);
                        ws.send(JSON.stringify({ type: 'ERROR', error: String(err) }));
                    }

                    // Setup real-time watching
                    try {
                        const id = msg.id;
                        const logFile = path.join(BRAIN_DIR, id, '.system_generated', 'logs', 'transcript.jsonl');
                        if (fs.existsSync(logFile)) {
                            if ((ws as any).transcriptWatcher) {
                                (ws as any).transcriptWatcher.close();
                            }
                            let currentSize = fs.statSync(logFile).size;
                            (ws as any).transcriptWatcher = fs.watch(logFile, (eventType, filename) => {
                                try {
                                    const newSize = fs.statSync(logFile).size;
                                    if (newSize > currentSize) {
                                        const fd = fs.openSync(logFile, 'r');
                                        const buffer = Buffer.alloc(newSize - currentSize);
                                        fs.readSync(fd, buffer, 0, newSize - currentSize, currentSize);
                                        fs.closeSync(fd);
                                        currentSize = newSize;
                                        
                                        const newContent = buffer.toString('utf-8');
                                        const lines = newContent.split('\n');
                                        const newMessages = [];
                                        for (const line of lines) {
                                            if (line.trim()) {
                                                try {
                                                    const parsed = JSON.parse(line);
                                                    newMessages.push(parsed);
                                                } catch(e) {}
                                            }
                                        }
                                        if (newMessages.length > 0) {
                                            ws.send(JSON.stringify({ type: 'TRANSCRIPT_DATA', data: newMessages }));
                                        }
                                    }
                                } catch (e) {
                                    // ignore read errors
                                }
                            });
                        }
                    } catch (err) {}
                }
            } catch (err) {
                console.error('[WebSocket] Error processing message', err);
            }
        });

        ws.on('close', () => {
            console.log('[WebSocket] Client disconnected');
            if (currentPtyProcess) {
                killAntigravity(currentPtyProcess);
            }
            if ((ws as any).transcriptWatcher) {
                (ws as any).transcriptWatcher.close();
            }
        });
    });
}
