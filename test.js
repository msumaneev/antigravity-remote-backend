const fs = require('fs');
const Database = require('better-sqlite3');
const path = require('path');

const dbDir = 'C:\\\\Users\\\\Michael Sumaneev\\\\.gemini\\\\antigravity\\\\conversations';
const dbs = fs.readdirSync(dbDir).filter(f => f.endsWith('.db'));

for (const dbFile of dbs) {
    const dbPath = path.join(dbDir, dbFile);
    const db = new Database(dbPath);
    try {
        const row = db.prepare('SELECT data FROM trajectory_metadata_blob LIMIT 1').get();
        if (row && row.data) {
            const str = row.data.toString('utf-8');
            console.log(dbFile, 'contains data of length', str.length);
            
            const parentMatch = str.match(/\*\$([a-f0-9\-]{36})/);
            const parentId = parentMatch ? parentMatch[1] : null;
            
            let tempStr = str;
            if (parentMatch) tempStr = tempStr.replace(parentMatch[0], '');
            const projectMatch = tempStr.match(/\$([a-f0-9\-]{36})/);
            const projectId = projectMatch ? projectMatch[1] : null;

            console.log('   projectId:', projectId, 'parentId:', parentId);
        }
    } catch (e) {
        console.log(dbFile, e.message);
    }
}
