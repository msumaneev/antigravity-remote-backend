const fs = require('fs');
const path = require('path');

const BRAIN_DIR = 'C:\\Users\\Michael Sumaneev\\.gemini\\antigravity\\brain';
let conversationId = process.argv[2];

if (!conversationId && process.env.ANTIGRAVITY_SOURCE_METADATA) {
    try {
        const meta = JSON.parse(process.env.ANTIGRAVITY_SOURCE_METADATA);
        if (meta.tool && meta.tool.conversationId) {
            conversationId = meta.tool.conversationId;
        }
    } catch(e) {}
}

if (!conversationId) {
    console.error("No conversation ID provided and could not be inferred.");
    process.exit(1);
}

const messagesDir = path.join(BRAIN_DIR, conversationId, '.system_generated', 'messages');
if (!fs.existsSync(messagesDir)) {
    fs.mkdirSync(messagesDir, { recursive: true });
}

let isExiting = false;
const existingFiles = new Set(fs.readdirSync(messagesDir));

const watcher = fs.watch(messagesDir, (eventType, filename) => {
    if (filename && filename.endsWith('.json') && !existingFiles.has(filename)) {
        if (isExiting) return;
        
        setTimeout(() => {
            try {
                const content = fs.readFileSync(path.join(messagesDir, filename), 'utf8');
                const data = JSON.parse(content);
                if (data.sender === 'USER_EXPLICIT') {
                    isExiting = true;
                    console.log(`[NEW_PHONE_MESSAGE] Found new file: ${filename}`);
                    watcher.close();
                    process.exit(0);
                } else {
                    existingFiles.add(filename);
                }
            } catch (e) {
                // ignore parsing errors
            }
        }, 500);
    }
});

console.log('Waiting for new messages from phone in inbox...');
