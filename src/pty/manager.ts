import * as os from 'os';
import * as pty from 'node-pty';
import { WebSocket } from 'ws';

// The shell to use (PowerShell on Windows, bash on others)
const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

export function spawnAntigravity(projectPath: string, ws: WebSocket) {
    console.log(`[PTY] Spawning process for project: ${projectPath}`);
    
    const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: projectPath,
        env: process.env as any
    });

    // To prevent ANSI coloring from polluting JSON parsing, we could run the CLI with NO_COLOR=1 
    // or parse ANSI codes, but for now we just stream stdout directly
    ptyProcess.onData((data) => {
        // Send raw terminal output directly to client
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PTY_DATA', data }));
        }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`[PTY] Process exited with code ${exitCode}`);
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'EVENT', data: `Process exited with code ${exitCode}` }));
        }
    });

    // Start antigravity CLI (Placeholder for actual CLI command)
    // Note: since it's powershell, we just write the command
    // ptyProcess.write('antigravity\r');

    return ptyProcess;
}

export function killAntigravity(ptyProcess: pty.IPty) {
    if (ptyProcess) {
        console.log(`[PTY] Killing process...`);
        ptyProcess.kill();
    }
}
