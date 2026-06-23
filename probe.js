const https = require('https');
const { discoverLanguageServer, initDiscovery } = require('./dist/agentapi/discovery.js');

initDiscovery();
const ls = discoverLanguageServer();
if (!ls) {
    console.log("LS not found");
    process.exit(1);
}

const services = [
    '/gemini.ide.v1.AgentStateService/StreamAgentStateUpdates',
    '/ide.v1.AgentStateService/StreamAgentStateUpdates',
    '/gemini.ide.v1.ChatService/StreamAgentStateUpdates'
];

async function check(path) {
    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'localhost',
            port: ls.httpPort,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/connect+json',
                'X-Csrf-Token': ls.csrfToken
            },
            rejectUnauthorized: false
        }, (res) => {
            console.log(`Path ${path} -> STATUS: ${res.statusCode}`);
            res.on('data', () => {});
            res.on('end', () => resolve(res.statusCode));
        });
        req.on('error', (e) => resolve(0));
        req.write('{}');
        req.end();
    });
}

async function run() {
    for (const s of services) {
        await check(s);
    }
}

run();
