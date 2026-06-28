import { callRPC, findLanguageServer } from './dist/api/languageServer.js';

async function test() {
    await findLanguageServer();
    try {
        const data = await callRPC('GetCascadeModelConfigData');
        console.log(JSON.stringify(data.clientModelConfigs, null, 2));
    } catch (e) {
        console.error(e);
    }
}
test();
