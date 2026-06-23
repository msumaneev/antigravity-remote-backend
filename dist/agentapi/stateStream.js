"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.agentStateStream = void 0;
const https_1 = __importDefault(require("https"));
const events_1 = require("events");
const discovery_1 = require("./discovery");
class AgentStateStream extends events_1.EventEmitter {
    req = null;
    reconnectTimer = null;
    connect() {
        if (this.req)
            return;
        const ls = (0, discovery_1.discoverLanguageServer)();
        if (!ls) {
            this.scheduleReconnect();
            return;
        }
        console.log('[StateStream] Connecting to StreamAgentStateUpdates...');
        this.req = https_1.default.request({
            hostname: 'localhost',
            port: ls.httpsPort,
            path: '/exa.language_server_pb.LanguageServerService/StreamAgentStateUpdates',
            method: 'POST',
            headers: {
                'Content-Type': 'application/connect+json',
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': ls.csrfToken
            },
            rejectUnauthorized: false
        }, (res) => {
            if (res.statusCode !== 200) {
                console.error(`[StateStream] Connection failed with status ${res.statusCode}`);
                this.req = null;
                this.scheduleReconnect();
                return;
            }
            console.log('[StateStream] Connected successfully.');
            let buffer = Buffer.alloc(0);
            res.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                // Parse Connect-RPC Envelope: [Flag(1)][Length(4)][Message...]
                while (buffer.length >= 5) {
                    const flags = buffer[0];
                    const length = buffer.readUInt32BE(1);
                    if (buffer.length >= 5 + length) {
                        const messageBuffer = buffer.slice(5, 5 + length);
                        buffer = buffer.slice(5 + length);
                        try {
                            const messageStr = messageBuffer.toString('utf8');
                            const messageObj = JSON.parse(messageStr);
                            this.emit('state', messageObj);
                        }
                        catch (err) {
                            console.error('[StateStream] Error parsing message:', err);
                        }
                    }
                    else {
                        break;
                    }
                }
            });
            res.on('end', () => {
                console.log('[StateStream] Stream ended.');
                this.req = null;
                this.scheduleReconnect();
            });
            res.on('error', (err) => {
                console.error('[StateStream] Stream error:', err);
                this.req = null;
                this.scheduleReconnect();
            });
        });
        this.req.on('error', (err) => {
            console.error('[StateStream] Request error:', err);
            this.req = null;
            this.scheduleReconnect();
        });
        // Send empty payload
        this.req.write(Buffer.from([0, 0, 0, 0, 2, 123, 125])); // Envelope for "{}"
        this.req.end();
    }
    scheduleReconnect() {
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, 3000);
    }
}
exports.agentStateStream = new AgentStateStream();
