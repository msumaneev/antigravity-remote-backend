import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Base directory for Antigravity Brain
const BRAIN_DIR = path.join(
    process.env.APPDATA || process.env.USERPROFILE || '',
    '.gemini', 'antigravity', 'brain'
);

export async function readTranscript(conversationId: string): Promise<any[]> {
    const transcriptPath = path.join(BRAIN_DIR, conversationId, '.system_generated', 'logs', 'transcript.jsonl');
    
    if (!fs.existsSync(transcriptPath)) {
        throw new Error(`Transcript not found at ${transcriptPath}`);
    }

    const lines: any[] = [];
    const fileStream = fs.createReadStream(transcriptPath, 'utf8');

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (line.trim()) {
            try {
                lines.push(JSON.parse(line));
            } catch (e) {
                console.warn('[History Parser] Failed to parse line:', line);
            }
        }
    }

    return lines;
}
