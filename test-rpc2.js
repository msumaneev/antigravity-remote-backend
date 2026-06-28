const { callRPC } = require('./dist/agentapi/rpc.js');
const { initDiscovery } = require('./dist/agentapi/discovery.js');

async function test() {
    console.log('Init discovery...');
    initDiscovery();
    const cmds = ['GetUsageAndQuota', 'GetSubscription', 'GetUserCascadeDetails', 'GetCreditUsageSummary', 'GetUsageStats'];
    for (const cmd of cmds) {
        console.log('\n--- Testing', cmd, '---');
        try {
            const data = await callRPC(cmd);
            console.log(JSON.stringify(data, null, 2));
        } catch (e) {
            console.log('Error or not found:', e.message);
        }
    }
}
test();
