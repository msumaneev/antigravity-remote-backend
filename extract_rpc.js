// Extract RPC method names from language_server.exe binary using strings-like approach
const fs = require('fs');
const path = require('path');

// Find language_server.exe
const possiblePaths = [
  path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity', 'resources', 'bin', 'language_server.exe'),
];

let lsPath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    lsPath = p;
    break;
  }
}

if (!lsPath) {
  // Try to find it
  const binDir = path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity', 'resources', 'bin');
  if (fs.existsSync(binDir)) {
    const files = fs.readdirSync(binDir);
    console.log('Files in bin dir:', files);
    for (const f of files) {
      if (f.includes('language_server') || f.includes('ls')) {
        lsPath = path.join(binDir, f);
        console.log('Found:', lsPath);
      }
    }
  }
}

if (!lsPath) {
  console.log('language_server.exe not found, searching...');
  process.exit(1);
}

console.log('Reading:', lsPath);
const buf = fs.readFileSync(lsPath);
console.log('Binary size:', buf.length, 'bytes');

// Search for all strings that match Connect-RPC path patterns
// Pattern: /package.Service/Method
const text = buf.toString('latin1');

// Find all strings matching RPC endpoint pattern
const rpcPattern = /\/exa\.language_server_pb\.\w+\/\w+/g;
const matches = new Set();
let m;
while ((m = rpcPattern.exec(text)) !== null) {
  matches.add(m[0]);
}

// Also search for other service patterns
const otherPattern = /\/exa\.\w+\.\w+\/\w+/g;
while ((m = otherPattern.exec(text)) !== null) {
  matches.add(m[0]);
}

// Search for /service.name/method pattern (generic)
const genericPattern = /\/[a-z][a-z0-9_.]+\.[A-Z]\w+\/[A-Z]\w+/g;
while ((m = genericPattern.exec(text)) !== null) {
  // Filter out common false positives
  if (!m[0].includes('.exe/') && !m[0].includes('.dll/') && !m[0].includes('.go/') && !m[0].includes('googleapis.com')) {
    matches.add(m[0]);
  }
}

const sorted = [...matches].sort();
console.log(`\n=== Found ${sorted.length} RPC endpoints ===\n`);

// Group by service
const services = {};
for (const endpoint of sorted) {
  const parts = endpoint.split('/');
  const service = parts[1];
  const method = parts[2];
  if (!services[service]) services[service] = [];
  services[service].push(method);
}

for (const [service, methods] of Object.entries(services).sort()) {
  console.log(`\n### ${service} (${methods.length} methods)`);
  for (const method of methods.sort()) {
    console.log(`  - ${method}`);
  }
}
