const https = require('https');
const { discoverLanguageServer, initDiscovery } = require('./dist/agentapi/discovery');

initDiscovery();
const ls = discoverLanguageServer();
if (!ls) {
    console.log('Language Server not found');
    process.exit(1);
}

console.log('Connecting to', ls.address);
const req = https.request({
    hostname: 'localhost',
    port: ls.httpsPort,
    path: '/exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates',
    method: 'POST',
    headers: {
        'Content-Type': 'application/connect+json',
        'Connect-Protocol-Version': '1',
        'X-Codeium-Csrf-Token': ls.csrfToken
    },
    rejectUnauthorized: false
}, (res) => {
    console.log('Status Code:', res.statusCode);
    let buffer = Buffer.alloc(0);

    res.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 5) {
            const flags = buffer[0];
            const length = buffer.readUInt32BE(1);
            if (buffer.length >= 5 + length) {
                const messageBuffer = buffer.slice(5, 5 + length);
                buffer = buffer.slice(5 + length);
                try {
                    const messageStr = messageBuffer.toString('utf8');
                    const messageObj = JSON.parse(messageStr);
                    console.log('State Obj Keys:', Object.keys(messageObj));
                    console.log('State Obj:', JSON.stringify(messageObj, null, 2));
                } catch (err) {
                    console.error('Error parsing:', err);
                }
            } else {
                break;
            }
        }
    });

    res.on('end', () => {
        console.log('Stream ended');
    });
});

const payloadObj = { cascade_id: "ee6f79e6-cc64-4991-b3b7-4bc2b589027b" };
const payloadStr = JSON.stringify(payloadObj);
const payloadBuf = Buffer.from(payloadStr, 'utf-8');

console.log('Sending payload:', payloadStr);
req.write(payloadStr);
req.end();

// Run for 3 seconds then exit
setTimeout(() => {
    console.log('Exiting...');
    process.exit(0);
}, 3000);
