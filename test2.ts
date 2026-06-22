import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const BRAIN_DIR = 'C:\\Users\\Michael Sumaneev\\.gemini\\antigravity\\brain';

function extractTitle(dir: string, id: string): string {
    return "Dummy Title";
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
    
    const projectMap: Record<string, string> = {};
    if (fs.existsSync(projectsConfigDir)) {
        const files = fs.readdirSync(projectsConfigDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(projectsConfigDir, file), 'utf-8');
                const data = JSON.parse(content);
                if (data.id && data.name) {
                    projectMap[data.id] = data.name;
                }
            } catch(e) {}
        }
    }
    
    const allChats: any[] = [];
    if (fs.existsSync(conversationsDbDir)) {
        const dbs = fs.readdirSync(conversationsDbDir).filter(f => f.endsWith('.db'));
        for (const dbFile of dbs) {
            const id = dbFile.replace('.db', '');
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
                    const projectMatch = tempStr.match(/\$([a-f0-9\-]{36})/);
                    const projectId = projectMatch ? projectMatch[1] : null;
                    
                    const dirPath = path.join(BRAIN_DIR, id);
                    const title = extractTitle(dirPath, id);
                    const subtitle = extractSubtitle(dirPath);
                    
                    allChats.push({
                        id,
                        projectId,
                        parentId,
                        title,
                        subtitle,
                        subagents: []
                    });
                }
                db.close();
            } catch(e) {}
        }
    }
    
    const projectsDict: Record<string, any> = {};
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
        const pId = chat.projectId || 'unknown';
        if (!projectsDict[pId]) {
            projectsDict[pId] = {
                projectName: projectMap[pId] || `Project ${pId.substring(0, 8)}`,
                conversations: []
            };
        }
        
        projectsDict[pId].conversations.push(chat);
    }
    
    return Object.values(projectsDict);
}

getProjectsTree().then(res => console.dir(res, { depth: null }));
