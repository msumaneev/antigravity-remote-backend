"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.spawnAntigravity = spawnAntigravity;
exports.killAntigravity = killAntigravity;
const os = __importStar(require("os"));
const pty = __importStar(require("node-pty"));
const ws_1 = require("ws");
// The shell to use (PowerShell on Windows, bash on others)
const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
function spawnAntigravity(projectPath, ws) {
    console.log(`[PTY] Spawning process for project: ${projectPath}`);
    const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: projectPath,
        env: process.env
    });
    // To prevent ANSI coloring from polluting JSON parsing, we could run the CLI with NO_COLOR=1 
    // or parse ANSI codes, but for now we just stream stdout directly
    ptyProcess.onData((data) => {
        // Send raw terminal output directly to client
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PTY_DATA', data }));
        }
    });
    ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`[PTY] Process exited with code ${exitCode}`);
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'EVENT', data: `Process exited with code ${exitCode}` }));
        }
    });
    // Start antigravity CLI (Placeholder for actual CLI command)
    // Note: since it's powershell, we just write the command
    // ptyProcess.write('antigravity\r');
    return ptyProcess;
}
function killAntigravity(ptyProcess) {
    if (ptyProcess) {
        console.log(`[PTY] Killing process...`);
        ptyProcess.kill();
    }
}
