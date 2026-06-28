const { callRPC } = require('./dist/agentapi/rpc');
const { initDiscovery } = require('./dist/agentapi/discovery');
async function test() {
  initDiscovery();
  const data = await callRPC('GetAllSkills');
  console.log(JSON.stringify(data, null, 2).substring(0, 500));
}
test().catch(console.error);
