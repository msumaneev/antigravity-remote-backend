import * as pty from 'node-pty';
import { WebSocket } from 'ws';
export declare function spawnAntigravity(projectPath: string, ws: WebSocket): pty.IPty;
export declare function killAntigravity(ptyProcess: pty.IPty): void;
//# sourceMappingURL=manager.d.ts.map