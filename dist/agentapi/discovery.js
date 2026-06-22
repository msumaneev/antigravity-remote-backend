"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverLanguageServer = discoverLanguageServer;
exports.initDiscovery = initDiscovery;
exports.invalidateDiscovery = invalidateDiscovery;
const child_process_1 = require("child_process");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
let cachedDiscovery = null;
/**
 * Get cached Language Server discovery result (non-blocking).
 */
function discoverLanguageServer(forceRefresh = false) {
    if (forceRefresh) {
        // Schedule async refresh but return current cache immediately
        refreshDiscoveryAsync();
    }
    return cachedDiscovery;
}
/**
 * Run discovery synchronously at server startup.
 * After this, use async refresh only.
 */
function initDiscovery() {
    try {
        const { execSync } = require('child_process');
        // Step 1: Find language_server.exe via wmic
        const wmicOutput = execSync('wmic process where "name=\'language_server.exe\'" get ProcessId,CommandLine /format:csv', { encoding: 'utf8', timeout: 10000, windowsHide: true });
        const result = parseWmicOutput(wmicOutput);
        if (!result)
            return;
        // Step 2: Find ports via netstat
        const netstatOutput = execSync('netstat -ano -p TCP', { encoding: 'utf8', timeout: 5000, windowsHide: true });
        const httpPort = parseNetstatOutput(netstatOutput, result.pid);
        if (!httpPort)
            return;
        cachedDiscovery = {
            pid: result.pid,
            csrfToken: result.csrfToken,
            httpPort,
            address: `localhost:${httpPort}`,
            agentApiPath: getAgentApiPath(),
        };
        console.log(`[Discovery] Found Language Server: PID=${result.pid}, Port=${httpPort}, CSRF=${result.csrfToken.substring(0, 8)}...`);
    }
    catch (err) {
        console.error('[Discovery] Init error:', err);
    }
}
/**
 * Refresh discovery asynchronously (non-blocking).
 */
function refreshDiscoveryAsync() {
    // Step 1: Get process info
    (0, child_process_1.execFile)('wmic', [
        'process', 'where', "name='language_server.exe'",
        'get', 'ProcessId,CommandLine', '/format:csv'
    ], { timeout: 10000, windowsHide: true }, (err, stdout) => {
        if (err) {
            console.log('[Discovery] Async refresh: language_server not found');
            cachedDiscovery = null;
            return;
        }
        const result = parseWmicOutput(stdout);
        if (!result) {
            cachedDiscovery = null;
            return;
        }
        // Step 2: Get ports
        (0, child_process_1.execFile)('netstat', ['-ano', '-p', 'TCP'], { timeout: 5000, windowsHide: true }, (err2, stdout2) => {
            if (err2) {
                cachedDiscovery = null;
                return;
            }
            const httpPort = parseNetstatOutput(stdout2, result.pid);
            if (!httpPort) {
                cachedDiscovery = null;
                return;
            }
            cachedDiscovery = {
                pid: result.pid,
                csrfToken: result.csrfToken,
                httpPort,
                address: `localhost:${httpPort}`,
                agentApiPath: getAgentApiPath(),
            };
            console.log(`[Discovery] Refreshed: PID=${result.pid}, Port=${httpPort}`);
        });
    });
}
function parseWmicOutput(output) {
    const lines = output.trim().split('\n').filter(l => l.trim() && l.includes('language_server'));
    if (lines.length === 0)
        return null;
    const line = lines[0].trim();
    const lastComma = line.lastIndexOf(',');
    const pid = parseInt(line.substring(lastComma + 1).trim(), 10);
    const cmdLine = line.substring(line.indexOf(',') + 1, lastComma);
    const csrfMatch = cmdLine.match(/--csrf_token\s+([a-f0-9\-]{36})/);
    if (!csrfMatch)
        return null;
    return { pid, csrfToken: csrfMatch[1] };
}
function parseNetstatOutput(output, pid) {
    const ports = [];
    const pidStr = String(pid);
    for (const line of output.split('\n')) {
        if (line.includes('LISTENING') && line.trim().endsWith(pidStr)) {
            const match = line.match(/:(\d+)\s/);
            if (match)
                ports.push(parseInt(match[1], 10));
        }
    }
    return ports.length > 0 ? Math.max(...ports) : null;
}
function getAgentApiPath() {
    return path_1.default.join(os_1.default.homedir(), 'AppData', 'Local', 'Programs', 'Antigravity', 'resources', 'bin', 'language_server.exe');
}
/**
 * Invalidate cached discovery (e.g., after a failed agentapi call).
 */
function invalidateDiscovery() {
    cachedDiscovery = null;
    // Schedule async re-discovery
    refreshDiscoveryAsync();
}
// Auto-refresh discovery every 60 seconds
setInterval(() => {
    refreshDiscoveryAsync();
}, 60_000);
