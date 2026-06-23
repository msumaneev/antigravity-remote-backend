import * as https from 'https';
import { discoverLanguageServer, initDiscovery } from './src/agentapi/discovery';

initDiscovery();
const ls = discoverLanguageServer();
if (!ls) {
    console.log("LS not found");
    process.exit(1);
}

const req = https.request({
    hostname: 'localhost',
    port: ls.httpPort,
    path: '/gemini.LanguageServer/StreamAgentStateUpdates',
    method: 'POST',
    headers: {
        'Content-Type': 'application/connect+json',
        'X-Csrf-Token': ls.csrfToken
    },
    rejectUnauthorized: false
}, (res: any) => {
    console.log(`STATUS: ${res.statusCode}`);
    console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    res.on('data', (chunk: any) => {
        console.log(`BODY: ${chunk}`);
    });
    res.on('end', () => {
        console.log('No more data in response.');
    });
});

req.on('error', (e: any) => {
    console.error(`problem with request: ${e.message}`);
});

req.write('{}');
req.end();
