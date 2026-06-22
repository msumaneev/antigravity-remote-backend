const fs = require('fs');
const path = 'C:\\Users\\Michael Sumaneev\\.gemini\\antigravity\\brain\\c9595225-471f-45a8-b6ce-841f16b97dfd\\.system_generated\\logs\\transcript.jsonl';
const lines = fs.readFileSync(path, 'utf8').split('\n');
const runs = lines.filter(l => l.includes('waitForMessage'));
console.log(`Found ${runs.length} lines with waitForMessage`);
console.log(runs[runs.length - 1]);
