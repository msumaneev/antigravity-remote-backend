import * as fs from 'fs';
import * as path from 'path';

const BRAIN_DIR = path.join(
    process.env.APPDATA || process.env.USERPROFILE || '',
    '.gemini', 'antigravity', 'brain'
);

export async function getProjects() {
    // For now, we will just scan the brain directory for conversation IDs
    // since every active chat/project has a conversation ID folder there.
    
    if (!fs.existsSync(BRAIN_DIR)) {
        return [];
    }

    const entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
    const projects = [];

    for (const entry of entries) {
        if (entry.isDirectory() && entry.name !== 'scratch') {
            const conversationId = entry.name;
            const logDir = path.join(BRAIN_DIR, conversationId, '.system_generated', 'logs');
            if (fs.existsSync(logDir)) {
                projects.push({
                    id: conversationId,
                    name: `Project/Session ${conversationId.substring(0, 8)}`,
                    path: path.join(BRAIN_DIR, conversationId)
                });
            }
        }
    }

    return projects;
}
