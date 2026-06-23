const { discoverLanguageServer } = require('./dist/agentapi/discovery.js');
const { callRPC } = require('./dist/agentapi/rpc.js');

async function run() {
    console.log("Discovering...");
    const ls = discoverLanguageServer();
    console.log("LS:", !!ls);
    
    console.log("Searching 'A'...");
    const resA = await callRPC('SearchConversations', { query: 'A' }, { timeoutMs: 10000 }).catch(e => e.message);
    console.log("Result A:", JSON.stringify(resA, null, 2));

    console.log("Searching 'An'...");
    const resAn = await callRPC('SearchConversations', { query: 'An' }, { timeoutMs: 10000 }).catch(e => e.message);
    console.log("Result An:", JSON.stringify(resAn, null, 2));
}

run();
