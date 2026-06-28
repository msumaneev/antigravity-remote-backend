import { callRPC } from './src/agentapi/rpc';
import { discoverLanguageServer } from './src/agentapi/discovery';

async function main() {
    console.log("Discovering...");
    const ls = discoverLanguageServer();
    console.log(ls);
    try {
        const data = await callRPC('GetCascadeModelConfigData', {}, { timeoutMs: 5000 });
        console.log(JSON.stringify(data.clientModelConfigs, null, 2));
    } catch (e) {
        console.error(e);
    }
}
main();
