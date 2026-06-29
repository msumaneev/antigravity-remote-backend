import express, { Express, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { readTranscript } from '../history/parser';
import Database from 'better-sqlite3';
import { spawnAntigravity, killAntigravity } from '../pty/manager';
import { sendMessage } from '../agentapi/sender';
import { discoverLanguageServer } from '../agentapi/discovery';
import { AgentStateStream } from '../agentapi/stateStream';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import https from 'https';
import { fileURLToPath } from 'url';
import { callRPC } from '../agentapi/rpc';
import { CascadeReactiveStream } from '../agentapi/cascadeStream';
import { listDevices, removeDevice, pairDevice, verifyToken, restrictDevice } from '../auth/auth';
import { generatePairingToken, getPermanentToken } from '../auth/tokens';
import QRCode from 'qrcode';
import { getChatHtml } from './chatHtml';

function getTailscaleIp(): string | null {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const ifaces = interfaces[name];
        if (!ifaces) continue;
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith('100.')) {
                    return iface.address;
                }
            }
        }
    }
    return null;
}

function getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const ifaces = interfaces[name];
        if (!ifaces) continue;
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (!iface.address.startsWith('100.')) {
                    return iface.address;
                }
            }
        }
    }
    return '127.0.0.1';
}

const GEMINI_DIR = path.join(os.homedir(), '.gemini');
const BRAIN_DIR = path.join(GEMINI_DIR, 'antigravity', 'brain');

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

    // Fallback: read pending messages (for chats created via RPC without transcript yet)
    try {
        const messagesDir = path.join(dir, '.system_generated', 'messages');
        if (fs.existsSync(messagesDir)) {
            const msgFiles = fs.readdirSync(messagesDir).filter(f => f.endsWith('.json'));
            for (const mf of msgFiles) {
                const msgData = JSON.parse(fs.readFileSync(path.join(messagesDir, mf), 'utf-8'));
                const content = msgData.content || '';
                // Extract text from [Отправлено с телефона]: ... or <USER_REQUEST>
                const phoneMatch = content.match(/\[Отправлено с телефона\]:\s*(.*?)(?:\\n|$)/s);
                if (phoneMatch) {
                    let title = phoneMatch[1].trim();
                    if (title.length > 50) title = title.substring(0, 50) + '...';
                    if (title) return title;
                }
                const reqMatch = content.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
                if (reqMatch) {
                    let title = reqMatch[1].replace(/<[^>]+>/g, '').trim();
                    if (title.length > 50) title = title.substring(0, 50) + '...';
                    if (title) return title;
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

let cachedProjectsTree: any[] | null = null;
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
    const projectsConfigDir = path.join(GEMINI_DIR, 'config', 'projects');
    const conversationsDbDir = path.join(GEMINI_DIR, 'antigravity', 'conversations');
    
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
    const summariesPbPath = path.join(GEMINI_DIR, 'antigravity', 'agyhub_summaries_proto.pb');
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
                    let projectId = matches.length > 0 ? matches[matches.length - 1][1] : null;
                    
                    // Extract workspace URI from blob for fallback project matching
                    const wsMatch = str.match(/file:\/\/\/[^\x00-\x1f]*/);
                    const workspaceUri = wsMatch ? wsMatch[0] : null;
                    
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
                        updatedAt,
                        stepCount: 0,
                        workspaceUri,
                    });
                }
                db.close();
            } catch(e) {
                console.error("Error reading DB for chat", id, e);
            }
        }
    }
    
    allChats.sort((a, b) => b.updatedAt - a.updatedAt);

    const projectsDict: Record<string, any> = {};
    
    // Initialize with all active projects
    for (const pId in projectMap) {
        projectsDict[pId] = {
            id: pId,
            name: projectMap[pId].name,
            title: projectMap[pId].name,
            projectName: projectMap[pId].name,
            projectPath: projectMap[pId].path,
            conversations: []
        };
    }
    
    // Build reverse lookup: normalized project path -> projectId
    const pathToProjectId: Record<string, string> = {};
    for (const pId in projectMap) {
        const normalizedPath = decodeURIComponent(projectMap[pId].path).replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
        pathToProjectId[normalizedPath] = pId;
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
        let pId = chat.projectId;
        
        // Fallback: if projectId not found in projectsDict, try matching by workspace URI
        if ((!pId || !projectsDict[pId]) && chat.workspaceUri) {
            const decodedUri = decodeURIComponent(chat.workspaceUri.replace('file:///', '')).replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
            const matchedPId = pathToProjectId[decodedUri];
            if (matchedPId) {
                pId = matchedPId;
            }
        }
        
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

function transformTrajectoriesToProjectTree(summaries: Record<string, any>): any[] {
    const projects = new Map<string, any>();
    
    const conversationsDbDir = path.join(GEMINI_DIR, 'antigravity', 'conversations');
    const archivedChatsPath = path.join(conversationsDbDir, 'archived_chats.json');
    let archivedChats = new Set<string>();
    if (fs.existsSync(archivedChatsPath)) {
        try {
            archivedChats = new Set(JSON.parse(fs.readFileSync(archivedChatsPath, 'utf-8')));
        } catch(e) {}
    }
    
    for (const [convId, traj] of Object.entries(summaries)) {
        if (archivedChats.has(convId)) continue;
        
        let rawProjectName = traj.workspaceName;
        if (!rawProjectName && traj.workspaceUri) {
            const decoded = decodeURIComponent(traj.workspaceUri);
            const parts = decoded.replace(/\/$/, '').split('/');
            rawProjectName = parts[parts.length - 1] || 'Unknown';
        }
        
        const projectName = decodeURIComponent(rawProjectName || 'Unknown');
        if (!projects.has(projectName)) {
            projects.set(projectName, {
                id: projectName,
                name: projectName,
                projectName,
                projectPath: traj.workspaceUri || '',
                conversations: [],
            });
        }
        
        projects.get(projectName)!.conversations.push({
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
            conversations: p.conversations.sort((a: any, b: any) => b.updatedAt - a.updatedAt),
        }))
        .sort((a, b) => {
            const aTime = a.conversations[0]?.updatedAt || 0;
            const bTime = b.conversations[0]?.updatedAt || 0;
            return bTime - aTime;
        });
}

import multer from 'multer';

async function filterProjectsTreeForDevice(tree: any[], device: any): Promise<any[]> {
    if (!device) return tree;
    const allowedProjectId = device.allowed_project_id;
    if (!allowedProjectId) return tree;
    
    const configTree = await getCachedProjectsTree();
    const configProj = configTree.find((p: any) => p.id === allowedProjectId);
    const allowedNames = [allowedProjectId];
    if (configProj) allowedNames.push(configProj.name);

    const res = tree.filter((p: any) => 
        allowedNames.includes(p.id) || 
        allowedNames.includes(p.name) ||
        allowedNames.includes(p.projectName)
    );
    return res;
}

// Configure multer to save files in a temporary directory or directly to the target conversation if possible.
// We'll use memory storage and write it manually to the right place so we can use conversationId.
const upload = multer({ storage: multer.memoryStorage() });

const cascadeStreams = new Map<string, CascadeReactiveStream>();
const agentStateStreams = new Map<string, AgentStateStream>();

export function getOrCreateAgentStateStream(conversationId: string, wss: WebSocketServer) {
    if (!conversationId) return null;
    if (conversationId.startsWith('START_NEW_AGENT_')) return null;
    if (agentStateStreams.has(conversationId)) {
        return agentStateStreams.get(conversationId)!;
    }
    const stream = new AgentStateStream(conversationId);
    stream.on('state', (stateObj) => {
        const payload = JSON.stringify({ type: 'AGENT_STATE', data: stateObj });
        wss.clients.forEach(client => {
            if (client.readyState === 1) { // 1 = OPEN
                client.send(payload);
            }
        });
    });
    stream.connect();
    agentStateStreams.set(conversationId, stream);
    return stream;
}

async function checkDeviceProjectAccess(msg: any, device: any): Promise<boolean> {
    if (!device) return true; // Before auth is fully set up, let AUTH messages pass
    if (!device.allowed_project_id) return true; // Unrestricted admin device

    const allowedProjectId = device.allowed_project_id;

    // Block interactive terminal commands entirely for restricted devices
    if (msg.type === 'KILL') return false;
    if (msg.type === 'START_AGENT') return false;
    if (msg.type === 'SEND_INPUT' && !msg.conversationId) return false;

    // 1. If projectPath is specified (verify it matches allowed project)
    if (msg.projectPath) {
        try {
            const tree = await getCachedProjectsTree();
            const project = tree.find((p: any) => 
                p.id === allowedProjectId || 
                p.name === allowedProjectId ||
                p.projectName === allowedProjectId
            );
            if (!project) return false;
            
            const normProject = (project.projectPath || '').replace(/\\/g, '/').toLowerCase().replace(/\/$/, '').replace('file:///', '');
            const normInput = (msg.projectPath || '').replace(/\\/g, '/').toLowerCase().replace(/\/$/, '').replace('file:///', '');
            return normProject === normInput;
        } catch (e) {
            return false;
        }
    }

    // 2. If conversationId or id is specified (verify it belongs to allowed project)
    const convId = msg.conversationId || msg.id;
    if (convId) {
        if (typeof convId === 'string' && convId.startsWith('START_NEW_AGENT_')) {
            const projectPath = convId.replace('START_NEW_AGENT_', '');
            try {
                const tree = await getCachedProjectsTree();
                const project = tree.find((p: any) => 
                    p.id === allowedProjectId || 
                    p.name === allowedProjectId ||
                    p.projectName === allowedProjectId
                );
                if (!project) return false;
                
                const normProject = (project.projectPath || '').replace(/\\/g, '/').toLowerCase().replace(/\/$/, '').replace('file:///', '');
                const normInput = projectPath.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '').replace('file:///', '');
                return normProject === normInput;
            } catch (e) {
                return false;
            }
        }

        try {
            const tree = await getCachedProjectsTree();
            const project = tree.find((p: any) => 
                p.id === allowedProjectId || 
                p.name === allowedProjectId ||
                p.projectName === allowedProjectId
            );
            if (!project) return false;

            const findInConversations = (convs: any[]): boolean => {
                for (const c of convs) {
                    if (c.id === convId) return true;
                    if (c.subagents && findInConversations(c.subagents)) return true;
                }
                return false;
            };

            return findInConversations(project.conversations || []);
        } catch (e) {
            return false;
        }
    }

    return true;
}

export function setupRoutes(app: Express, wss: WebSocketServer) {
    // Serve APK for easy Wi-Fi installation
    app.use('/download-apk', express.static(path.join(__dirname, '../../../android/app/build/outputs/apk/debug')));

    app.get('/', async (req: Request, res: Response) => {
        try {
            const token = generatePairingToken();
            const html = getChatHtml(token);
            res.setHeader('Content-Type', 'text/html');
            res.send(html);
        } catch (err: any) {
            res.status(500).send('Error rendering Web Chat');
        }
    });

    app.get('/admin', async (req: Request, res: Response) => {
        const ip = req.ip || req.socket.remoteAddress || '';
        const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.endsWith('127.0.0.1');
        if (!isLocal) {
            res.status(403).send('Forbidden: Admin console is only accessible from localhost');
            return;
        }
        try {
            const token = generatePairingToken();
            const port = process.env.PORT || 8080;
            const ips = getTailscaleIp() ? [getTailscaleIp(), getLocalIp()] : [getLocalIp()];
            
            const payload = JSON.stringify({
                ips: ips.filter(Boolean),
                port: port,
                pairing_token: token
            });

            const qrDataUrl = await QRCode.toDataURL(payload);
            
            const html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Antigravity Remote Admin Console</title>
                    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
                    <style>
                        :root {
                            --bg-color: #0f172a;
                            --card-bg: rgba(30, 41, 59, 0.7);
                            --card-border: rgba(255, 255, 255, 0.08);
                            --text-primary: #f8fafc;
                            --text-secondary: #94a3b8;
                            --accent-color: #6366f1;
                            --accent-hover: #4f46e5;
                            --danger-color: #ef4444;
                            --danger-hover: #dc2626;
                            --success-color: #10b981;
                            --glass-blur: blur(12px);
                        }

                        * {
                            box-sizing: border-box;
                            margin: 0;
                            padding: 0;
                        }

                        body {
                            background-color: var(--bg-color);
                            color: var(--text-primary);
                            font-family: 'Outfit', sans-serif;
                            min-height: 100vh;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            padding: 2rem 1rem;
                            background-image: 
                                radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 40%),
                                radial-gradient(circle at 90% 80%, rgba(16, 185, 129, 0.1) 0%, transparent 40%);
                            background-attachment: fixed;
                        }

                        header {
                            text-align: center;
                            margin-bottom: 3rem;
                            animation: fadeInDown 0.8s ease-out;
                        }

                        header h1 {
                            font-size: 2.5rem;
                            font-weight: 800;
                            background: linear-gradient(135deg, #a5b4fc 0%, #6366f1 50%, #34d399 100%);
                            -webkit-background-clip: text;
                            -webkit-text-fill-color: transparent;
                            margin-bottom: 0.5rem;
                            letter-spacing: -0.025em;
                        }

                        header p {
                            color: var(--text-secondary);
                            font-size: 1.1rem;
                        }

                        .container {
                            max-width: 1200px;
                            width: 100%;
                            display: grid;
                            grid-template-columns: 1fr;
                            gap: 2rem;
                            animation: fadeIn 1s ease-out;
                        }

                        @media (min-width: 900px) {
                            .container {
                                grid-template-columns: 380px 1fr;
                            }
                        }

                        .panel {
                            background: var(--card-bg);
                            backdrop-filter: var(--glass-blur);
                            border: 1px solid var(--card-border);
                            border-radius: 24px;
                            padding: 2rem;
                            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2);
                            transition: transform 0.3s ease, box-shadow 0.3s ease;
                        }

                        .panel:hover {
                            transform: translateY(-2px);
                            box-shadow: 0 25px 30px -5px rgba(0, 0, 0, 0.4), 0 15px 15px -5px rgba(0, 0, 0, 0.3);
                        }

                        .panel h2 {
                            font-size: 1.4rem;
                            font-weight: 600;
                            margin-bottom: 1.5rem;
                            display: flex;
                            align-items: center;
                            gap: 0.5rem;
                            color: #a5b4fc;
                        }

                        .qr-section {
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            text-align: center;
                        }

                        .qr-container {
                            background: white;
                            padding: 1rem;
                            border-radius: 20px;
                            box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3);
                            margin-bottom: 1.5rem;
                            transition: transform 0.3s ease;
                        }

                        .qr-container:hover {
                            transform: scale(1.03);
                        }

                        .qr-container img {
                            display: block;
                            max-width: 100%;
                            height: auto;
                        }

                        .qr-info {
                            font-size: 0.95rem;
                            color: var(--text-secondary);
                            line-height: 1.5;
                        }

                        .qr-info strong {
                            color: var(--text-primary);
                        }

                        .device-card {
                            background: rgba(15, 23, 42, 0.4);
                            border: 1px solid var(--card-border);
                            border-radius: 16px;
                            padding: 1.25rem;
                            margin-bottom: 1rem;
                            display: flex;
                            flex-direction: column;
                            gap: 1rem;
                            transition: all 0.2s ease;
                        }

                        .device-card:hover {
                            border-color: rgba(99, 102, 241, 0.3);
                            background: rgba(15, 23, 42, 0.6);
                        }

                        .device-header {
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                        }

                        .device-name {
                            font-weight: 600;
                            font-size: 1.1rem;
                            color: var(--text-primary);
                        }

                        .device-meta {
                            font-size: 0.8rem;
                            color: var(--text-secondary);
                            display: flex;
                            flex-direction: column;
                            gap: 0.25rem;
                            margin-top: 0.25rem;
                        }

                        .badge {
                            font-size: 0.75rem;
                            font-weight: 600;
                            padding: 0.25rem 0.6rem;
                            border-radius: 9999px;
                            text-transform: uppercase;
                        }

                        .badge-active {
                            background-color: rgba(16, 185, 129, 0.15);
                            color: var(--success-color);
                            border: 1px solid rgba(16, 185, 129, 0.3);
                        }

                        .badge-restricted {
                            background-color: rgba(245, 158, 11, 0.15);
                            color: #f59e0b;
                            border: 1px solid rgba(245, 158, 11, 0.3);
                        }

                        .control-group {
                            display: flex;
                            flex-wrap: wrap;
                            gap: 0.5rem;
                            align-items: center;
                        }

                        select {
                            background: #1e293b;
                            border: 1px solid var(--card-border);
                            color: var(--text-primary);
                            padding: 0.6rem 1rem;
                            border-radius: 10px;
                            font-family: inherit;
                            font-size: 0.9rem;
                            flex: 1;
                            min-width: 180px;
                            outline: none;
                            cursor: pointer;
                            transition: border-color 0.2s;
                        }

                        select:focus {
                            border-color: var(--accent-color);
                        }

                        button {
                            padding: 0.6rem 1.2rem;
                            border-radius: 10px;
                            font-family: inherit;
                            font-weight: 600;
                            font-size: 0.9rem;
                            border: none;
                            cursor: pointer;
                            transition: all 0.2s ease;
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                        }

                        .btn-primary {
                            background: var(--accent-color);
                            color: white;
                        }

                        .btn-primary:hover {
                            background: var(--accent-hover);
                        }

                        .btn-danger {
                            background: rgba(239, 68, 68, 0.1);
                            color: var(--danger-color);
                            border: 1px solid rgba(239, 68, 68, 0.2);
                        }

                        .btn-danger:hover {
                            background: var(--danger-color);
                            color: white;
                        }

                        .empty-state {
                            text-align: center;
                            padding: 3rem 1rem;
                            color: var(--text-secondary);
                        }

                        .empty-state svg {
                            width: 48px;
                            height: 48px;
                            margin-bottom: 1rem;
                            stroke: var(--text-secondary);
                        }

                        @keyframes fadeInDown {
                            from {
                                opacity: 0;
                                transform: translateY(-20px);
                            }
                            to {
                                opacity: 1;
                                transform: translateY(0);
                            }
                        }

                        @keyframes fadeIn {
                            from { opacity: 0; }
                            to { opacity: 1; }
                        }
                    </style>
                </head>
                <body>
                    <header>
                        <h1>Antigravity Remote Console</h1>
                        <p>Управление сопряженными устройствами и изоляцией проектов</p>
                    </header>

                    <div class="container">
                        <!-- Left Panel: QR Code Pairing -->
                        <div class="panel qr-section">
                            <h2>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h.01M19 17h.01M5 7h.01M19 7h.01M7 12h10M12 7v10"/></svg>
                                Сопряжение
                            </h2>
                            <div class="qr-container">
                                <img src="${qrDataUrl}" alt="Pairing QR Code" />
                            </div>
                            <div class="qr-info">
                                <p>Откройте приложение <strong>Antigravity Remote</strong> на смартфоне и отсканируйте этот QR-код для подключения.</p>
                                <p style="margin-top: 0.5rem; font-size: 0.85rem; opacity: 0.7;">Токен действителен 5 минут.</p>
                                <!-- For test parsing -->
                                <div style="display:none">${token}</div>
                            </div>
                        </div>

                        <!-- Right Panel: Device Management -->
                        <div class="panel">
                            <h2>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                                Устройства в сети
                            </h2>
                            <div id="device-list">
                                <div class="empty-state">Загрузка списка устройств...</div>
                            </div>
                        </div>
                    </div>

                    <script>
                        let projects = [];
                        let devices = [];

                        async function init() {
                            await loadProjects();
                            await loadDevices();
                        }

                        async function loadProjects() {
                            try {
                                const res = await fetch('/api/projects');
                                projects = await res.json();
                            } catch (e) {
                                console.error('Failed to load projects', e);
                            }
                        }

                        async function loadDevices() {
                            try {
                                const res = await fetch('/api/devices');
                                devices = await res.json();
                                renderDevices();
                            } catch (e) {
                                document.getElementById('device-list').innerHTML = 
                                    '<div class="empty-state">Ошибка загрузки списка устройств</div>';
                            }
                        }

                        async function restrictDevice(deviceId, projectId) {
                            try {
                                const res = await fetch(\`/api/devices/\${deviceId}/restrict\`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ projectId })
                                });
                                const result = await res.json();
                                if (result.success) {
                                    await loadDevices();
                                } else {
                                    alert('Не удалось обновить ограничения: ' + (result.error || 'Неизвестная ошибка'));
                                }
                            } catch (e) {
                                alert('Ошибка соединения с сервером');
                            }
                        }

                        async function deleteDevice(deviceId) {
                            if (!confirm('Вы уверены, что хотите удалить это устройство?')) return;
                            try {
                                const res = await fetch(\`/api/devices/\${deviceId}\`, {
                                    method: 'DELETE'
                                });
                                const result = await res.json();
                                if (result.success) {
                                    await loadDevices();
                                } else {
                                    alert('Не удалось удалить устройство');
                                }
                            } catch (e) {
                                alert('Ошибка соединения с сервером');
                            }
                        }

                        function renderDevices() {
                            const listEl = document.getElementById('device-list');
                            if (devices.length === 0) {
                                listEl.innerHTML = \`
                                    <div class="empty-state">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                                        <p>Нет подключенных устройств</p>
                                    </div>
                                \`;
                                return;
                            }

                            listEl.innerHTML = devices.map(device => {
                                const pairedDate = new Date(device.pairedAt).toLocaleString();
                                const lastSeenDate = device.lastSeen ? new Date(device.lastSeen).toLocaleString() : 'Никогда';
                                
                                const isRestricted = !!device.allowed_project_id;
                                const badgeClass = isRestricted ? 'badge-restricted' : 'badge-active';
                                const badgeText = isRestricted ? 'Ограничен' : 'Полный доступ';

                                const projectOptions = [
                                    '<option value="">-- Полный доступ (Без ограничений) --</option>',
                                    ...projects.map(p => {
                                        const selected = device.allowed_project_id === p.id || device.allowed_project_id === p.projectName ? 'selected' : '';
                                        return \`<option value="\${p.id || p.projectName}" \${selected}>\${p.projectName || p.name}</option>\`;
                                    })
                                ].join('');

                                return \`
                                    <div class="device-card">
                                        <div class="device-header">
                                            <div>
                                                <div class="device-name">\${escapeHtml(device.name)}</div>
                                                <div class="device-meta">
                                                    <span>ID: \${device.id}</span>
                                                    <span>Сопряжено: \${pairedDate}</span>
                                                    <span>Активность: \${lastSeenDate}</span>
                                                </div>
                                            </div>
                                            <span class="badge \${badgeClass}">\${badgeText}</span>
                                        </div>
                                        <div class="control-group">
                                            <select onchange="restrictDevice('\${device.id}', this.value)">
                                                \${projectOptions}
                                            </select>
                                            <button class="btn-danger" onclick="deleteDevice('\${device.id}')">Удалить</button>
                                        </div>
                                    </div>
                                \`;
                            }).join('');
                        }

                        function escapeHtml(str) {
                            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
                        }

                        init();
                    </script>
                </body>
                </html>
            `;
            res.setHeader('Content-Type', 'text/html');
            res.send(html);
        } catch (err: any) {
            res.status(500).send('Error generating QR code');
        }
    });

    // REST: Check Language Server status (is Antigravity running?)
    app.get('/api/ls-status', (req: Request, res: Response) => {
        const discovery = discoverLanguageServer(true);
        if (discovery) {
            res.json({
                available: true,
                pid: discovery.pid,
                port: discovery.httpPort,
                method: 'agentapi',
            });
        } else {
            res.json({
                available: false,
                method: 'file-fallback',
            });
        }
    });

    app.post('/api/update-server', (req: Request, res: Response) => {
        const isWindows = process.platform === 'win32';
        const scriptPath = path.join(__dirname, '..', '..', 'scripts', isWindows ? 'update.bat' : 'update.sh');
        
        console.log(`[Update] Received update request. Spawning update script: ${scriptPath}`);
        
        if (!fs.existsSync(scriptPath)) {
            res.status(500).json({ success: false, error: 'Update script not found' });
            return;
        }

        // Send success response to client first so it doesn't hang
        res.json({ success: true, message: 'Update process initiated. Server is restarting.' });

        // Close WebSocket server to release connections immediately
        try {
            wss.close();
        } catch (e) {}

        // Spawn update script detached and exit
        const { spawn } = require('child_process');
        const child = spawn(isWindows ? 'cmd.exe' : 'bash', isWindows ? ['/c', scriptPath] : [scriptPath], {
            detached: true,
            stdio: 'ignore',
            cwd: path.join(__dirname, '..', '..')
        });

        child.unref();

        // Give process brief moment to detach and then exit
        setTimeout(() => {
            console.log('[Update] Exiting process to allow update script to run.');
            process.exit(0);
        }, 500);
    });

    app.get('/api/trajectories', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('GetAllCascadeTrajectories');
            let tree = transformTrajectoriesToProjectTree(data.trajectorySummaries || {});
            tree = await filterProjectsTreeForDevice(tree, (req as any).device);
            res.json(tree);
        } catch (err) {
            let tree = await getCachedProjectsTree();
            tree = await filterProjectsTreeForDevice(tree, (req as any).device);
            res.json(tree);
        }
    });

    app.get('/api/models', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('GetCascadeModelConfigData');
            res.json(data.clientModelConfigs || []);
        } catch (err) {
            res.status(503).json({ error: 'Language Server unavailable' });
        }
    });

    app.get('/api/model-usage', async (req: Request, res: Response) => {
        res.json([
            { model: "Gemini 3.1 Pro (High)", calls: 342 },
            { model: "Claude 3.5 Sonnet", calls: 120 }
        ]);
    });

    // Read server version for health endpoint
    let serverVersion = '2.0.0';
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));
        if (pkg.version) serverVersion = pkg.version;
    } catch {}

    app.get('/api/health', async (req: Request, res: Response) => {
        try {
            const heartbeat = await callRPC('Heartbeat', {}, { timeoutMs: 2000 });
            const ls = discoverLanguageServer();
            res.json({ 
                ok: true, 
                lsRunning: !!ls,
                lastHeartbeat: heartbeat.lastExtensionHeartbeat,
                pid: ls?.pid,
                version: serverVersion,
            });
        } catch {
            res.json({ ok: true, lsRunning: false, version: serverVersion });
        }
    });

    app.get('/api/pair', (req: Request, res: Response) => {
        try {
            const token = generatePairingToken();
            res.json({ token });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/exchange', (req: Request, res: Response) => {
        try {
            const { pairingToken, deviceName } = req.body;
            if (!pairingToken) {
                res.status(400).json({ error: 'Pairing token is required' });
                return;
            }
            const permanentToken = getPermanentToken(pairingToken);
            if (!permanentToken) {
                res.status(401).json({ error: 'Invalid or expired pairing token' });
                return;
            }
            const { token: jwtToken } = pairDevice(deviceName || 'Android Device');
            res.json({ token: jwtToken });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/account', async (req: Request, res: Response) => {
        try {
            const [userStatus, profile] = await Promise.all([
                callRPC('GetUserStatus', {}, { timeoutMs: 3000 }),
                callRPC('GetProfileData', {}, { timeoutMs: 3000 }),
            ]);
            res.json({
                name: userStatus.userStatus?.name,
                email: userStatus.userStatus?.email,
                plan: userStatus.userStatus?.planStatus?.planInfo?.planName,
                monthlyPromptCredits: userStatus.userStatus?.planStatus?.planInfo?.monthlyPromptCredits,
                monthlyFlowCredits: userStatus.userStatus?.planStatus?.planInfo?.monthlyFlowCredits,
                avatarUrl: profile.profilePictureUrl,
            });
        } catch (err) {
            res.status(503).json({ error: 'Failed to get account info' });
        }
    });

    app.get('/api/devices', (req: Request, res: Response) => {
        try {
            const requester = (req as any).device;
            if (!requester || requester.deviceId !== 'local-admin') {
                res.status(403).json({ error: 'Forbidden: Only local administrator can access this endpoint' });
                return;
            }
            const devices = listDevices();
            res.json(devices);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.delete('/api/devices/self', (req: Request, res: Response) => {
        try {
            const deviceId = (req as any).device?.deviceId;
            if (!deviceId) {
                res.status(401).json({ error: 'Not authenticated' });
                return;
            }
            const success = removeDevice(deviceId);
            res.json({ success });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.delete('/api/devices/:id', (req: Request, res: Response) => {
        try {
            const requester = (req as any).device;
            if (!requester || requester.deviceId !== 'local-admin') {
                res.status(403).json({ error: 'Forbidden: Only local administrator can access this endpoint' });
                return;
            }
            const success = removeDevice(req.params.id as string);
            res.json({ success });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/devices/:id/restrict', (req: Request, res: Response) => {
        try {
            const requester = (req as any).device;
            if (!requester || requester.deviceId !== 'local-admin') {
                res.status(403).json({ error: 'Forbidden: Only local administrator can access this endpoint' });
                return;
            }
            const { projectId } = req.body;
            const success = restrictDevice(req.params.id as string, projectId || null);
            res.json({ success });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/mcp', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('GetMcpServerStates');
            res.json(data.states || []);
        } catch (err) {
            res.status(503).json({ error: 'Failed to get MCP states' });
        }
    });

    app.post('/api/mcp/toggle', async (req: Request, res: Response) => {
        try {
            const { serverName } = req.body;
            await callRPC('ToggleMcpServer', { serverName });
            res.json({ success: true });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/mcp/refresh', async (req: Request, res: Response) => {
        try {
            await callRPC('RefreshMcpServers');
            res.json({ success: true });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/search', async (req: Request, res: Response) => {
        const query = req.query.q as string;
        console.log('[Search] Received query:', JSON.stringify(query));
        if (!query) return res.json([]);
        try {
            const lowerQuery = query.toLowerCase();
            const projects = await getCachedProjectsTree();
            const results: any[] = [];
            
            function searchConv(conv: any) {
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
        } catch (err) {
            res.status(503).json({ error: 'Search unavailable' });
        }
    });

    app.get('/api/turn-diff/:conversationId', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('GetTurnDiff', { 
                conversationId: req.params.conversationId 
            });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/files', async (req: Request, res: Response) => {
        let uri = req.query.uri as string;
        const allowedProjectId = (req as any).device?.allowed_project_id;
        try {
            if (allowedProjectId) {
                const tree = await getCachedProjectsTree();
                const project = tree.find((p: any) => 
                    p.id === allowedProjectId || 
                    p.name === allowedProjectId ||
                    p.projectName === allowedProjectId
                );
                if (!project) {
                    res.status(403).json({ error: 'Access denied' });
                    return;
                }
                const allowedPath = decodeURIComponent(project.projectPath || '').replace(/\\/g, '/').toLowerCase().replace(/\/$/, '').replace('file:///', '');
                
                if (!uri || uri === "file:///") {
                    uri = project.projectPath;
                } else {
                    const reqPath = decodeURIComponent(uri).replace(/\\/g, '/').toLowerCase().replace(/\/$/, '').replace('file:///', '');
                    if (!reqPath.startsWith(allowedPath)) {
                        res.status(403).json({ error: 'Access denied: Out of project scope' });
                        return;
                    }
                }
            } else if (!uri || uri === "file:///") {
                const projects = await getCachedProjectsTree();
                if (projects && projects.length > 0 && projects[0].projectResources?.resources?.[0]?.folderUri) {
                    uri = projects[0].projectResources.resources[0].folderUri;
                }
            }
            const data = await callRPC('ReadDir', { uri });
            if (data && Array.isArray(data.entries)) {
                data.entries = data.entries.map((entry: any) => {
                    let name = '';
                    let isDirectory = false;
                    let size = 0;
                    let mtime = 0;

                    if (entry.uri) {
                        try {
                            const decodedUri = decodeURIComponent(entry.uri);
                            name = decodedUri.replace(/\/$/, '').split('/').pop() || '';
                            
                            if (entry.uri.startsWith('file://')) {
                                const filePath = fileURLToPath(entry.uri);
                                if (fs.existsSync(filePath)) {
                                    const stat = fs.statSync(filePath);
                                    isDirectory = stat.isDirectory();
                                    size = isDirectory ? 0 : stat.size;
                                    mtime = stat.mtime.getTime();
                                }
                            }
                        } catch (e) {
                            console.error('[Files] Error parsing entry', entry.uri, e);
                        }
                    }
                    
                    if (!isDirectory && entry.fileType) {
                        isDirectory = entry.fileType === 2 || entry.fileType === 'directory';
                    }

                    return {
                        ...entry,
                        name: name || entry.name || '',
                        isDirectory,
                        size,
                        mtime
                    };
                });
            }
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/file', async (req: Request, res: Response) => {
        const uri = req.query.uri as string;
        const allowedProjectId = (req as any).device?.allowed_project_id;
        try {
            if (allowedProjectId) {
                const tree = await getCachedProjectsTree();
                const project = tree.find((p: any) => 
                    p.id === allowedProjectId || 
                    p.name === allowedProjectId ||
                    p.projectName === allowedProjectId
                );
                if (!project) {
                    res.status(403).json({ error: 'Access denied' });
                    return;
                }
                const allowedPath = decodeURIComponent(project.projectPath || '').replace(/\\/g, '/').toLowerCase().replace(/\/$/, '').replace('file:///', '');
                const reqPath = decodeURIComponent(uri || '').replace(/\\/g, '/').toLowerCase().replace(/\/$/, '').replace('file:///', '');
                if (!reqPath.startsWith(allowedPath)) {
                    res.status(403).json({ error: 'Access denied: Out of project scope' });
                    return;
                }
            }
            const data = await callRPC('ReadFile', { uri });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- PHASE 3 ---

    // GIT Endpoints
    app.get('/api/git/state', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('GetVersionControlState', { workspaceUri: req.query.workspaceUri });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });
    
    app.get('/api/git/file', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('GetVersionControlFileContent', { uri: req.query.uri });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/git/commit', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('GenerateCommitMessage', { repository: req.body.repository });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/git/diff', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('GetWorktreeDiff', { worktreeDirUri: req.query.worktreeDirUri });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Customization Endpoints
    app.get('/api/customizations/skills', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('GetAllSkills');
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/customizations/plugins', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('GetAllPlugins');
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/customizations/rules', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('GetAllRules');
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/customizations/marketplace', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('GetAvailableCascadePlugins');
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/customizations/install', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('InstallCascadePlugin', { pluginId: req.body.pluginId });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/customizations/delete', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('DeletePlugin', { pluginId: req.body.pluginId });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Search Endpoints
    app.get('/api/search/code', async (req: Request, res: Response) => {
        try {
            let wsUri = req.query.workspaceUri as string;
            if (!wsUri) {
                const projects = await getCachedProjectsTree();
                if (projects && projects.length > 0 && projects[0].projectResources?.resources?.[0]?.folderUri) {
                    wsUri = projects[0].projectResources.resources[0].folderUri;
                }
            }
            const data = await callRPC('SearchCode', { query: req.query.query, workspaceUri: wsUri });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/search/files', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('SearchFiles', { query: req.query.query, workspaceUri: req.query.workspaceUri });
            res.json(data);
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Slash commands
    app.get('/api/slash-commands', async (req: Request, res: Response) => {
        try {
            const data = await callRPC('GetSlashCommands', {
                requestedModel: { model: req.query.model || 'MODEL_CHAT_20706' }
            });
            res.json(data);
        } catch (err: any) {
            res.status(503).json({ error: 'Unavailable' });
        }
    });


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
            let projects = await getCachedProjectsTree();
            projects = await filterProjectsTreeForDevice(projects, (req as any).device);
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
            
            const conversationsDbDir = path.join(GEMINI_DIR, 'antigravity', 'conversations');
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
            
            // Security check: must be inside BRAIN_DIR or one of the project workspaces
            const isAllowed = (() => {
                const normalizedLower = normalizedPath.toLowerCase();
                const brainDirLower = path.normalize(BRAIN_DIR).toLowerCase();
                if (normalizedLower.startsWith(brainDirLower)) {
                    return true;
                }
                
                const configDirLower = path.normalize(path.join(GEMINI_DIR, 'config')).toLowerCase();
                if (normalizedLower.startsWith(configDirLower)) {
                    return true;
                }

                const projectsConfigDir = path.join(GEMINI_DIR, 'config', 'projects');
                if (fs.existsSync(projectsConfigDir)) {
                    try {
                        const files = fs.readdirSync(projectsConfigDir).filter(f => f.endsWith('.json'));
                        for (const file of files) {
                            try {
                                const content = fs.readFileSync(path.join(projectsConfigDir, file), 'utf-8');
                                const data = JSON.parse(content);
                                if (data.projectResources?.resources?.[0]?.folderUri) {
                                    const uri = data.projectResources.resources[0].folderUri;
                                    let pPath = uri.replace('file:///', '');
                                    pPath = decodeURIComponent(pPath);
                                    const projDirLower = path.normalize(pPath).toLowerCase();
                                    if (normalizedLower.startsWith(projDirLower)) {
                                        return true;
                                    }
                                }
                            } catch (e) {}
                        }
                    } catch (e) {}
                }
                return false;
            })();

            if (!isAllowed) {
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
                console.log('[WebSocket] Received:', msg.type);
                
                // Allow some actions without authentication
                if (msg.type === 'LIST_CONVERSATIONS') {
                    try {
                        let tree = await getProjectsTree();
                        tree = await filterProjectsTreeForDevice(tree, (ws as any).device);
                        ws.send(JSON.stringify({ type: 'CONVERSATIONS_LIST', data: tree }));
                    } catch (err) {
                        console.error('[WebSocket] Error in LIST_CONVERSATIONS:', err);
                        ws.send(JSON.stringify({ type: 'ERROR', error: String(err) }));
                    }
                    return;
                }

                // --- AUTH CHECK ---
                if (!(ws as any).authenticated) {
                    if (msg.type === 'AUTH') {
                        const { token, authType, deviceName } = msg;
                        if (authType === 'pairing') {
                            const permanentToken = getPermanentToken(token);
                            if (permanentToken) {
                                // Create permanent JWT using the old auth system
                                const { token: jwtToken } = pairDevice(deviceName || 'Android Device');
                                (ws as any).authenticated = true;
                                ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', token: jwtToken }));
                                return;
                            }
                        } else if (authType === 'permanent') {
                            const device = verifyToken(token);
                            if (device) {
                                (ws as any).authenticated = true;
                                (ws as any).device = device;
                                ws.send(JSON.stringify({ type: 'AUTH_SUCCESS' }));
                                return;
                            }
                        }
                        ws.send(JSON.stringify({ type: 'ERROR', error: 'Authentication failed' }));
                        ws.close();
                        return;
                    }
                    // Reject any other message
                    ws.send(JSON.stringify({ type: 'ERROR', error: 'Not authenticated' }));
                    ws.close();
                    return;
                }
                // --- END AUTH CHECK ---

                // --- PROJECT ISOLATION CHECK ---
                const isAllowed = await checkDeviceProjectAccess(msg, (ws as any).device);
                if (!isAllowed) {
                    ws.send(JSON.stringify({ type: 'ERROR', error: 'Access denied: You are not authorized to access this project or conversation' }));
                    return;
                }
                // --- END PROJECT ISOLATION CHECK ---

                if (msg.type === 'SUBSCRIBE_STATS') {
                    (ws as any).subscribedToStats = true;
                    return;
                } else if (msg.type === 'UNSUBSCRIBE_STATS') {
                    (ws as any).subscribedToStats = false;
                    return;
                }

                // Ensure state stream is running for any received conversationId/id
                if (msg.conversationId) {
                    getOrCreateAgentStateStream(msg.conversationId, wss);
                } else if (msg.id) {
                    getOrCreateAgentStateStream(msg.id, wss);
                }

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
                        try {
                            const result = await sendMessage(conversationId, msg.data, msg.model);
                            if (result.success) {
                                if (result.newConvId) {
                                    ws.send(JSON.stringify({ type: 'CHAT_CREATED', oldId: msg.conversationId, newId: result.newConvId }));
                                }
                                ws.send(JSON.stringify({
                                    type: 'EVENT',
                                    data: `Message delivered via ${result.method}`
                                }));
                            } else {
                                ws.send(JSON.stringify({
                                    type: 'ERROR',
                                    error: `Failed to send: ${result.error}`
                                }));
                            }
                        } catch (err) {
                            console.error('[WebSocket] Error sending message:', err);
                            ws.send(JSON.stringify({
                                type: 'ERROR',
                                error: `Send failed: ${err}`
                            }));
                        }
                    }
                } else if (msg.type === 'APPROVE_INTERACTION' || msg.type === 'REJECT_INTERACTION') {
                    if (msg.conversationId && msg.interactionPayload) {
                        const isApprove = msg.type === 'APPROVE_INTERACTION';
                        let finalInteraction = msg.interactionPayload;
                        
                        if (!isApprove) {
                            // Deny Interaction logic
                            const COMMON = new Set(['trajectoryId', 'stepIndex', 'timedOut']);
                            const out: any = {};
                            for (const [key, val] of Object.entries(finalInteraction)) {
                                if (COMMON.has(key) || val === null || typeof val !== 'object') { out[key] = val; continue; }
                                if (key === 'filePermission') {
                                    out[key] = { absolutePathUri: (val as any).absolutePathUri };
                                    continue;
                                }
                                const member = { ...(val as any) };
                                if ('confirm' in member) member.confirm = false;
                                if ('allow' in member) member.allow = false;
                                if ('cancel' in member) member.cancel = true;
                                if ('cancelled' in member) member.cancelled = true;
                                out[key] = member;
                            }
                            finalInteraction = out;
                        }

                        const body = {
                            cascadeId: msg.conversationId,
                            interaction: finalInteraction
                        };

                        const ls = discoverLanguageServer();
                        if (ls) {
                            const req = https.request({
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
                            }, (res: any) => {
                                console.log(`[Interaction] ${isApprove ? 'Approved' : 'Rejected'}, status=${res.statusCode}`);
                            });
                            req.on('error', (e: any) => console.error('[Interaction] Error:', e));
                            req.write(JSON.stringify(body));
                            req.end();
                        } else {
                            console.error('[Interaction] No Language Server found to handle interaction');
                        }
                    }
                } else if (msg.type === 'KILL') {
                    if (currentPtyProcess) {
                        killAntigravity(currentPtyProcess);
                        currentPtyProcess = null;
                        ws.send(JSON.stringify({ type: 'EVENT', data: 'Process killed by user' }));
                    }
                } else if (msg.type === 'LIST_CONVERSATIONS_V2') {
                    try {
                        const data = await callRPC('GetAllCascadeTrajectories');
                        let tree = transformTrajectoriesToProjectTree(data.trajectorySummaries || {});
                        tree = await filterProjectsTreeForDevice(tree, (ws as any).device);
                        ws.send(JSON.stringify({ type: 'CONVERSATIONS_LIST', data: tree }));
                    } catch (err) {
                        try {
                            let tree = await getProjectsTree();
                            tree = await filterProjectsTreeForDevice(tree, (ws as any).device);
                            ws.send(JSON.stringify({ type: 'CONVERSATIONS_LIST', data: tree }));
                        } catch (fallbackErr) {
                            console.error('[WebSocket] Error in LIST_CONVERSATIONS_V2 fallback:', fallbackErr);
                            ws.send(JSON.stringify({ type: 'ERROR', error: String(fallbackErr) }));
                        }
                    }
                } else if (msg.type === 'GET_MODELS') {
                    try {
                        const data = await callRPC('GetCascadeModelConfigData');
                        console.log('--- MODELS_LIST ---');
                        console.log(JSON.stringify(data.clientModelConfigs, null, 2));
                        ws.send(JSON.stringify({ type: 'MODELS_LIST', data: data.clientModelConfigs || [] }));
                    } catch (err) {
                        ws.send(JSON.stringify({ type: 'ERROR', error: 'Failed to get models' }));
                    }
                } else if (msg.type === 'GET_QUOTA_SUMMARY') {
                    try {
                        const data = await callRPC('RetrieveUserQuotaSummary');
                        ws.send(JSON.stringify({ 
                            type: 'QUOTA_SUMMARY', 
                            data: data.response
                        }));
                    } catch (err) {
                        ws.send(JSON.stringify({ type: 'ERROR', error: 'Failed to get quota summary' }));
                    }
                } else if (msg.type === 'DELETE_CONVERSATION') {
                    try {
                        const { conversationId } = msg;
                        if (!conversationId) throw new Error("Missing conversationId");
                        const conversationPath = path.join(BRAIN_DIR, conversationId);
                        if (fs.existsSync(conversationPath)) {
                            fs.rmSync(conversationPath, { recursive: true, force: true });
                        }
                        ws.send(JSON.stringify({ type: 'EVENT', data: `Deleted conversation ${conversationId}` }));
                    } catch (err: any) {
                        ws.send(JSON.stringify({ type: 'ERROR', error: `Failed to delete: ${err.message}` }));
                    }
                } else if (msg.type === 'STOP_AGENT') {
                    try {
                        const { conversationId } = msg;
                        await callRPC('ForceStopCascadeTree', { conversationId });
                        ws.send(JSON.stringify({ type: 'EVENT', data: 'Agent stopped' }));
                    } catch (err: any) {
                        ws.send(JSON.stringify({ type: 'ERROR', error: `Failed to stop: ${err.message}` }));
                    }
                } else if (msg.type === 'FORK_CONVERSATION') {
                    try {
                        const { conversationId } = msg;
                        const data = await callRPC('ForkConversation', { sourceCascadeId: conversationId });
                        ws.send(JSON.stringify({ type: 'FORK_RESULT', data }));
                    } catch (err: any) {
                        ws.send(JSON.stringify({ type: 'ERROR', error: err.message }));
                    }
                } else if (msg.type === 'LIST_CONVERSATIONS') {
                    try {
                        let data = await getProjectsTree();
                        data = await filterProjectsTreeForDevice(data, (ws as any).device);
                        console.log("Sending CONVERSATIONS_LIST with length:", data ? data.length : "null");
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
                            const allMsgs: any[] = [];
                            for (const line of lines) {
                                if (line.trim()) {
                                    try {
                                        allMsgs.push(JSON.parse(line));
                                    } catch(e) {}
                                }
                            }
                            
                            const limit = msg.limit || 50;
                            const offset = msg.offset || 0;
                            
                            const endIdx = allMsgs.length - offset;
                            const startIdx = Math.max(0, endIdx - limit);
                            
                            if (startIdx < endIdx) {
                                const chunk = allMsgs.slice(startIdx, endIdx);
                                ws.send(JSON.stringify({ type: 'TRANSCRIPT_DATA', data: chunk, offset: offset + chunk.length, hasMore: startIdx > 0, isPagination: offset > 0 }));
                            } else {
                                ws.send(JSON.stringify({ type: 'TRANSCRIPT_DATA', data: [], offset, hasMore: false, isPagination: offset > 0 }));
                            }
                        } else {
                            // Transcript file doesn't exist yet — check messages/ for pending user messages
                            const messagesDir = path.join(BRAIN_DIR, id, '.system_generated', 'messages');
                            const pendingMsgs: any[] = [];
                            if (fs.existsSync(messagesDir)) {
                                const msgFiles = fs.readdirSync(messagesDir).filter(f => f.endsWith('.json'));
                                for (const mf of msgFiles) {
                                    try {
                                        const msgData = JSON.parse(fs.readFileSync(path.join(messagesDir, mf), 'utf-8'));
                                        // Extract user text from USER_REQUEST tags
                                        let userText = msgData.content || '';
                                        const match = userText.match(/\[Отправлено с телефона\]:\s*(.*?)\\n/s);
                                        if (match) userText = match[1].trim();
                                        else {
                                            const reqMatch = userText.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
                                            if (reqMatch) userText = reqMatch[1].trim();
                                        }
                                        pendingMsgs.push({
                                            step_index: 0,
                                            source: 'USER_EXPLICIT',
                                            type: 'USER_INPUT',
                                            status: 'DONE',
                                            created_at: msgData.timestamp || new Date().toISOString(),
                                            content: userText,
                                        });
                                    } catch(e) {}
                                }
                            }
                            if (pendingMsgs.length > 0) {
                                // Add a system message indicating the agent hasn't started yet
                                pendingMsgs.push({
                                    step_index: 1,
                                    source: 'SYSTEM',
                                    type: 'PLANNER_RESPONSE',
                                    status: 'DONE',
                                    created_at: new Date().toISOString(),
                                    content: '⏳ Сообщение отправлено. Ожидание запуска агента...',
                                });
                            }
                            ws.send(JSON.stringify({ type: 'TRANSCRIPT_DATA', data: pendingMsgs, offset: 0, hasMore: false, isPagination: false }));
                        }
                    } catch (err) {
                        console.error('[WebSocket] Error in GET_TRANSCRIPT:', err);
                        ws.send(JSON.stringify({ type: 'ERROR', error: String(err) }));
                    }

                    // Setup real-time watching
                    const conversationId = msg.id;
                    if (!cascadeStreams.has(conversationId)) {
                        const stream = new CascadeReactiveStream(conversationId);
                        stream.on('update', (data) => {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({ type: 'CASCADE_UPDATE', data }));
                            }
                        });
                        stream.connect();
                        cascadeStreams.set(conversationId, stream);
                    }
                    if (!(ws as any).myCascadeStreams) (ws as any).myCascadeStreams = new Set<string>();
                    (ws as any).myCascadeStreams.add(conversationId);

                    if (true) {
                        try {
                            const id = msg.id;
                        const logFile = path.join(BRAIN_DIR, id, '.system_generated', 'logs', 'transcript.jsonl');
                        if (fs.existsSync(logFile)) {
                            if ((ws as any).transcriptWatcher) {
                                (ws as any).transcriptWatcher.close();
                            }
                            let currentSize = fs.statSync(logFile).size;
                            const watcher = fs.watch(logFile, (eventType, filename) => {
                                try {
                                    const newSize = fs.statSync(logFile).size;
                                    if (newSize > currentSize) {
                                        const readStart = currentSize;
                                        const readLength = newSize - readStart;
                                        currentSize = newSize; // Update immediately to prevent duplicate reads on rapid OS triggers
                                        
                                        const fd = fs.openSync(logFile, 'r');
                                        const buffer = Buffer.alloc(readLength);
                                        fs.readSync(fd, buffer, 0, readLength, readStart);
                                        fs.closeSync(fd);
                                        
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
                            watcher.on('error', (err) => {
                                console.log('[WebSocket] Watcher error ignored on deletion');
                            });
                            (ws as any).transcriptWatcher = watcher;
                        }
                    } catch (err) {}
                    }
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
            if ((ws as any).myCascadeStreams) {
                for (const convId of (ws as any).myCascadeStreams) {
                    const stream = cascadeStreams.get(convId);
                    if (stream) {
                        stream.disconnect();
                        cascadeStreams.delete(convId);
                    }
                }
            }
        });
    });
}
