const fs = require('fs');
const path = require('path');

const BRAIN_DIR = 'C:\\Users\\Michael Sumaneev\\.gemini\\antigravity\\brain';
const conversationId = process.argv[2];

if (!conversationId) {
    console.error('No conversation ID provided');
    process.exit(1);
}

const messagesDir = path.join(BRAIN_DIR, conversationId, '.system_generated', 'messages');

if (!fs.existsSync(messagesDir)) {
    fs.mkdirSync(messagesDir, { recursive: true });
}

let isExiting = false;

// We need to keep track of existing files so we don't trigger on them
const existingFiles = new Set(fs.readdirSync(messagesDir));

const watcher = fs.watch(messagesDir, (eventType, filename) => {
    if (filename && filename.endsWith('.json') && !existingFiles.has(filename)) {
        if (isExiting) return;
        isExiting = true;
        
        const filePath = path.join(messagesDir, filename);
        // Wait a tiny bit to ensure the file is fully written by the backend
        setTimeout(() => {
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const msg = JSON.parse(content);
                // Check if the sender is USER_EXPLICIT (from phone)
                if (msg.sender === 'USER_EXPLICIT') {
                    console.log(`[NEW_PHONE_MESSAGE] ${msg.content}`);
                    watcher.close();
                    process.exit(0);
                } else {
                    isExiting = false;
                    existingFiles.add(filename);
                }
            } catch (e) {
                isExiting = false;
            }
        }, 50);
    }
});

console.log('Waiting for new messages from phone...');
