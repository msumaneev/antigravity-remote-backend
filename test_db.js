const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const BRAIN_DIR = 'C:/Users/Michael Sumaneev/.gemini/antigravity/brain';

function extractTitle(dirPath, id) { return 'Title'; }
function extractSubtitle(dirPath) { return 'Subtitle'; }

const projectsConfigDir = 'C:\\Users\\Michael Sumaneev\\.gemini\\config\\projects';
const conversationsDbDir = 'C:\\Users\\Michael Sumaneev\\.gemini\\antigravity\\conversations';

const allChats = [];
const dbs = fs.readdirSync(conversationsDbDir).filter(f => f.endsWith('.db'));
for (const dbFile of dbs) {
    const id = dbFile.replace('.db', '');
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
            const projectMatch = tempStr.match(/\$([a-f0-9\-]{36})/);
            const projectId = projectMatch ? projectMatch[1] : null;
            allChats.push({ id, projectId, parentId });
        }
        db.close();
    } catch (e) {
        console.error('Error reading', dbFile, e.message);
    }
}
console.log(allChats);
