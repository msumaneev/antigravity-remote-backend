import { execFile } from 'child_process';
import os from 'os';
import path from 'path';

export interface LSDiscovery {
    pid: number;
    csrfToken: string;
    httpPort: number;
    httpsPort: number;
    address: string;
    agentApiPath: string;
}

let cachedDiscovery: LSDiscovery | null = null;

/**
 * Get cached Language Server discovery result (non-blocking).
 */
export function discoverLanguageServer(forceRefresh = false): LSDiscovery | null {
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
export function initDiscovery(): void {
    try {
        const { execSync } = require('child_process');
        
        // Step 1: Find language_server.exe via wmic
        const wmicOutput = execSync(
            'wmic process where "name=\'language_server.exe\'" get ProcessId,CommandLine /format:csv',
            { encoding: 'utf8', timeout: 10000, windowsHide: true }
        );

        const result = parseWmicOutput(wmicOutput);
        if (!result) return;

        // Step 2: Find ports via netstat
        const netstatOutput = execSync(
            'netstat -ano -p TCP',
            { encoding: 'utf8', timeout: 5000, windowsHide: true }
        );

        const ports = parseNetstatOutput(netstatOutput, result.pid);
        if (!ports) return;

        cachedDiscovery = {
            pid: result.pid,
            csrfToken: result.csrfToken,
            httpPort: ports.max,
            httpsPort: ports.min,
            address: `localhost:${ports.max}`,
            agentApiPath: getAgentApiPath(),
        };

        console.log(`[Discovery] Found Language Server: PID=${result.pid}, HTTP=${ports.max}, HTTPS=${ports.min}, CSRF=${result.csrfToken.substring(0, 8)}...`);
    } catch (err) {
        console.error('[Discovery] Init error:', err);
    }
}

/**
 * Refresh discovery asynchronously (non-blocking).
 */
function refreshDiscoveryAsync(): void {
    // Step 1: Get process info
    execFile('wmic', [
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
        execFile('netstat', ['-ano', '-p', 'TCP'], { timeout: 5000, windowsHide: true }, (err2, stdout2) => {
            if (err2) {
                cachedDiscovery = null;
                return;
            }

            const ports = parseNetstatOutput(stdout2, result.pid);
            if (!ports) {
                cachedDiscovery = null;
                return;
            }

            cachedDiscovery = {
                pid: result.pid,
                csrfToken: result.csrfToken,
                httpPort: ports.max,
                httpsPort: ports.min,
                address: `localhost:${ports.max}`,
                agentApiPath: getAgentApiPath(),
            };
            console.log(`[Discovery] Refreshed: PID=${result.pid}, HTTP=${ports.max}, HTTPS=${ports.min}`);
        });
    });
}

function parseWmicOutput(output: string): { pid: number; csrfToken: string } | null {
    const lines = output.trim().split('\n').filter(l => l.trim() && l.includes('language_server'));
    if (lines.length === 0) return null;

    const line = lines[0].trim();
    const lastComma = line.lastIndexOf(',');
    const pid = parseInt(line.substring(lastComma + 1).trim(), 10);
    const cmdLine = line.substring(line.indexOf(',') + 1, lastComma);

    const csrfMatch = cmdLine.match(/--csrf_token\s+([a-f0-9\-]{36})/);
    if (!csrfMatch) return null;

    return { pid, csrfToken: csrfMatch[1] };
}

function parseNetstatOutput(output: string, pid: number): { min: number, max: number } | null {
    const ports: number[] = [];
    const pidStr = String(pid);
    
    for (const line of output.split('\n')) {
        if (line.includes('LISTENING') && line.trim().endsWith(pidStr)) {
            const match = line.match(/:(\d+)\s/);
            if (match) ports.push(parseInt(match[1], 10));
        }
    }

    return ports.length > 0 ? { min: Math.min(...ports), max: Math.max(...ports) } : null;
}

function getAgentApiPath(): string {
    return path.join(
        os.homedir(), 'AppData', 'Local', 'Programs',
        'Antigravity', 'resources', 'bin', 'language_server.exe'
    );
}

/**
 * Invalidate cached discovery (e.g., after a failed agentapi call).
 */
export function invalidateDiscovery(): void {
    cachedDiscovery = null;
    // Schedule async re-discovery
    refreshDiscoveryAsync();
}

// Auto-refresh discovery every 60 seconds
setInterval(() => {
    refreshDiscoveryAsync();
}, 60_000);
