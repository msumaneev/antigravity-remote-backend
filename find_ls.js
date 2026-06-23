// Script to discover all available Connect-RPC methods on the Language Server
// by using gRPC/Connect reflection or probing known paths

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

// Discover LS
function findLS() {
  try {
    const result = execSync('wmic process where "name=\'language_server.exe\'" get CommandLine /VALUE', { encoding: 'utf8' });
    const csrfMatch = result.match(/csrf[_-]token[=\s]+([a-zA-Z0-9_-]+)/i) || result.match(/--csrf[_-]token[=\s]+([a-zA-Z0-9_-]+)/i);
    if (!csrfMatch) {
      // Try alternative format
      const tokenMatch = result.match(/([a-zA-Z0-9_-]{20,})/);
    }
    
    const pid = execSync('wmic process where "name=\'language_server.exe\'" get ProcessId /VALUE', { encoding: 'utf8' });
    const pidMatch = pid.match(/ProcessId=(\d+)/);
    
    if (pidMatch) {
      const netstat = execSync(`netstat -ano | findstr "${pidMatch[1]}" | findstr "LISTENING"`, { encoding: 'utf8' });
      console.log('LS PID:', pidMatch[1]);
      console.log('Listening ports:\n', netstat);
    }
    
    console.log('\nFull command line (looking for CSRF):');
    console.log(result.substring(0, 2000));
    
    return result;
  } catch (e) {
    console.error('Error finding LS:', e.message);
  }
}

findLS();
