// Extract clean RPC method names from app.asar (Deck frontend)
const fs = require('fs');
const path = require('path');

const asarPath = path.join(process.env.LOCALAPPDATA, 'Programs', 'Antigravity', 'resources', 'app.asar');
const buf = fs.readFileSync(asarPath);
const text = buf.toString('utf8');

// Look for all references to LanguageServerService method calls
// Connect-RPC clients typically reference methods as strings
const patterns = [
  // Pattern: "/exa.language_server_pb.LanguageServerService/MethodName"
  /exa\.language_server_pb\.LanguageServerService\/([A-Z][a-zA-Z]+)/g,
  // Pattern: method names in service definition objects  
  /name:\s*["']([A-Z][a-zA-Z]+)["']/g,
  // Pattern: createConnectRpc or similar
  /["']([A-Z][a-zA-Z]{3,60})["']\s*[,\]]/g,
];

const methods = new Set();

// Search for full service path references
const fullPathRe = /\/exa\.language_server_pb\.LanguageServerService\/([A-Za-z]+)/g;
let m;
while ((m = fullPathRe.exec(text)) !== null) {
  methods.add(m[1]);
}

console.log(`Found ${methods.size} LanguageServerService methods in app.asar:`);
[...methods].sort().forEach(x => console.log('  ' + x));

// Also search for other service references
console.log('\n--- Other service paths ---');
const otherServices = new Set();
const svcRe = /\/exa\.([a-z_]+)\.([A-Za-z]+)\/([A-Za-z]+)/g;
while ((m = svcRe.exec(text)) !== null) {
  const svc = `exa.${m[1]}.${m[2]}`;
  otherServices.add(svc);
}
[...otherServices].sort().forEach(x => console.log('  ' + x));

// Search for Jetbox-related patterns
console.log('\n--- Jetbox references ---');
const jetboxRe = /Jetbox([A-Z][a-zA-Z]+)/g;
const jetboxMethods = new Set();
while ((m = jetboxRe.exec(text)) !== null) {
  jetboxMethods.add('Jetbox' + m[1]);
}
[...jetboxMethods].sort().forEach(x => console.log('  ' + x));

// Search for streaming-related patterns
console.log('\n--- Stream references ---');
const streamRe = /Stream([A-Z][a-zA-Z]+)/g;
const streamMethods = new Set();
while ((m = streamRe.exec(text)) !== null) {
  const name = 'Stream' + m[1];
  if (name.length < 60 && !name.includes('Error') && !name.includes('ing ')) {
    streamMethods.add(name);
  }
}
[...streamMethods].sort().forEach(x => console.log('  ' + x));
