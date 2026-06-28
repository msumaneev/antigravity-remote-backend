const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const GEMINI_DIR = path.join(os.homedir(), '.gemini');
const BRAIN_DIR = path.join(GEMINI_DIR, 'antigravity', 'brain');

function extractTitle(dir, id) { return id; }
function extractSubtitle(dir) { return ''; }

const projectsConfigDir = path.join(GEMINI_DIR, 'config', 'projects');
const conversationsDbDir = path.join(GEMINI_DIR, 'antigravity', 'conversations');

const projectMap = {};
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
let archivedChats = [];
if (fs.existsSync(archivedChatsPath)) {
    try {
        archivedChats = JSON.parse(fs.readFileSync(archivedChatsPath, 'utf-8'));
    } catch(e) {}
}

const allChats = [];
if (fs.existsSync(conversationsDbDir)) {
    const dbs = fs.readdirSync(conversationsDbDir).filter(f => f.endsWith('.db'));
    for (const dbFile of dbs) {
        const id = dbFile.replace('.db', '');
        if (archivedChats.includes(id)) continue;
        
        const dbPath = path.join(conversationsDbDir, dbFile);
        try {
            const db = new Database(dbPath, { readonly: true });
            const row = db.prepare('SELECT data FROM trajectory_metadata_blob LIMIT 1').get();
            if (row && row.data) {
                const str = row.data.toString('utf-8');
                const parentMatch = str.match(/\*\$([a-f0-9\-]{36})/);
                const parentId = parentMatch ? parentMatch[1] : null;
                
                let tempStr = str;
                if (parentMatch) tempStr = tempStr.replace(parentMatch[0], '');
                const matches = [...tempStr.matchAll(/\$([a-f0-9\-]{36})/g)];
                let projectId = matches.length > 0 ? matches[matches.length - 1][1] : null;
                
                const wsMatch = str.match(/file:\/\/\/[^\x00-\x1f]*/);
                const workspaceUri = wsMatch ? wsMatch[0] : null;
                
                const updatedAt = fs.statSync(dbPath).mtime.getTime();
                
                allChats.push({
                    id,
                    projectId,
                    parentId,
                    updatedAt,
                    workspaceUri,
                });
            }
            db.close();
        } catch(e) {}
    }
}

allChats.sort((a, b) => b.updatedAt - a.updatedAt);

const projectsDict = {};
for (const pId in projectMap) {
    projectsDict[pId] = {
        id: pId,
        name: projectMap[pId].name,
        projectName: projectMap[pId].name,
        projectPath: projectMap[pId].path,
        conversations: []
    };
}

const pathToProjectId = {};
for (const pId in projectMap) {
    const normalizedPath = decodeURIComponent(projectMap[pId].path).replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
    pathToProjectId[normalizedPath] = pId;
}

const chatMap = {};
for (const chat of allChats) {
    chatMap[chat.id] = chat;
}

const topLevelChats = [];
for (const chat of allChats) {
    if (chat.parentId && chatMap[chat.parentId]) {
        // subagents logic skipped
    } else {
        topLevelChats.push(chat);
    }
}

let missed = 0;
let success = 0;
for (const chat of topLevelChats) {
    let pId = chat.projectId;
    if ((!pId || !projectsDict[pId]) && chat.workspaceUri) {
        const decodedUri = decodeURIComponent(chat.workspaceUri.replace('file:///', '')).replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
        const matchedPId = pathToProjectId[decodedUri];
        if (matchedPId) {
            pId = matchedPId;
        }
    }
    
    if (!pId || !projectsDict[pId]) {
        missed++;
        continue;
    }
    
    success++;
    projectsDict[pId].conversations.push(chat);
}

console.log("Projects loaded:", Object.keys(projectsDict).length);
console.log("Total chats:", allChats.length);
console.log("Top-level chats:", topLevelChats.length);
console.log("Successfully matched:", success);
console.log("Missed:", missed);
