// Use gRPC Server Reflection to list all services and methods from running Language Server
const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

// Discover LS
function findLS() {
  try {
    const result = execSync('wmic process where "name=\'language_server.exe\'" get CommandLine /VALUE', { encoding: 'utf8' });
    const csrfMatch = result.match(/csrf[_-]?token[=\s]+([a-f0-9-]+)/i);
    const csrf = csrfMatch ? csrfMatch[1] : null;
    
    const pid = execSync('wmic process where "name=\'language_server.exe\'" get ProcessId /VALUE', { encoding: 'utf8' });
    const pidMatch = pid.match(/ProcessId=(\d+)/);
    const pidVal = pidMatch ? pidMatch[1] : null;
    
    let httpsPort = null;
    if (pidVal) {
      const netstat = execSync(`netstat -ano | findstr "${pidVal}" | findstr "LISTENING"`, { encoding: 'utf8' });
      const portMatches = netstat.matchAll(/:(\d+)\s+.*LISTENING/g);
      for (const pm of portMatches) {
        const port = parseInt(pm[1]);
        if (port > 1000 && port < 65535) {
          httpsPort = port;
          break;
        }
      }
    }
    
    return { csrf, port: httpsPort, pid: pidVal };
  } catch (e) {
    console.error('Error finding LS:', e.message);
    return null;
  }
}

// Try Connect-RPC request to list services
async function listServices(port, csrf) {
  // Try known methods and see what we get
  const knownMethods = [
    'GetAvailableModels',
    'GetUserStatus', 
    'GetAllCascadeTrajectories',
    'GetSlashCommands',
    'GetMcpServerStates',
    'GetAllSkills',
    'GetAllWorkflows',
    'GetAllRules',
    'GetRepoInfos',
    'GetWorkspaceInfos',
    'GetVersionControlState',
    'GetSidecars',
    'GetAllPlugins',
    'Heartbeat',
    'GetStatus',
    'GetDebugDiagnostics',
    'GetCascadeMemories',
    'GetUserSettings',
    'GetChangelog',
    'GetWorkingDirectories',
    'GetLocalUserInfo',
    'JetboxSubscribeToSummaries',
    'GetCascadeModelConfigs',
    'GetModelStatuses',
    'GetAllCustomAgentConfigs',
    'GetConversationMetadata',
    'SearchFiles',
    'SearchCode',
    'GetUserMemories',
  ];
  
  for (const method of knownMethods) {
    try {
      const result = await makeRequest(port, csrf, method, {});
      console.log(`\n✅ ${method}:`);
      const str = JSON.stringify(result);
      console.log(str.substring(0, 500));
    } catch (e) {
      console.log(`❌ ${method}: ${e.message.substring(0, 100)}`);
    }
  }
}

function makeRequest(port, csrf, method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      hostname: '127.0.0.1',
      port: port,
      path: `/exa.language_server_pb.LanguageServerService/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
        'X-Codeium-Csrf-Token': csrf,
      },
      rejectUnauthorized: false,
    };
    
    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve(responseData.substring(0, 300));
        }
      });
    });
    
    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

async function main() {
  const ls = findLS();
  if (!ls) {
    console.log('Language Server not found!');
    return;
  }
  
  console.log('LS found:', ls);
  await listServices(ls.port, ls.csrf);
}

main().catch(console.error);
