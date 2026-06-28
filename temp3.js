const { callRPC } = require('./dist/agentapi/rpc');
const { initDiscovery } = require('./dist/agentapi/discovery');
async function test() {
  initDiscovery();
  try {
    const data = await callRPC('GetAllWorkspaces', {});
    console.log(data);
  } catch(e) {
    console.log('Error:', e.message);
  }
}
test();
