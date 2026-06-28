const { callRPC } = require('./dist/agentapi/rpc');
const { initDiscovery } = require('./dist/agentapi/discovery');
async function test() {
  initDiscovery();
  const data = await callRPC('GetAllCascadeTrajectories', {});
  console.log(Object.keys(data.trajectorySummaries || {}).length);
}
test().catch(console.error);
