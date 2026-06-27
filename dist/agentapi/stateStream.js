"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentStateStream = void 0;
const https_1 = __importDefault(require("https"));
const events_1 = require("events");
const discovery_1 = require("./discovery");
class AgentStateStream extends events_1.EventEmitter {
    conversationId;
    req = null;
    reconnectTimer = null;
    constructor(conversationId) {
        super();
        this.conversationId = conversationId;
    }
    connect() {
        if (this.req)
            return;
        const ls = (0, discovery_1.discoverLanguageServer)();
        if (!ls) {
            this.scheduleReconnect();
            return;
        }
        console.log(`[StateStream] Connecting to StreamAgentStateUpdates for ${this.conversationId}...`);
        const payloadObj = { conversationId: this.conversationId };
        const payloadStr = JSON.stringify(payloadObj);
        const payloadBuf = Buffer.from(payloadStr, 'utf8');
        // Connect-RPC Envelope: [Flag(1)][Length(4)][Message...]
        const envelope = Buffer.alloc(5 + payloadBuf.length);
        envelope[0] = 0; // flag
        envelope.writeUInt32BE(payloadBuf.length, 1);
        payloadBuf.copy(envelope, 5);
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
                console.error(`[StateStream] Connection failed with status ${res.statusCode} for ${this.conversationId}`);
                this.req = null;
                this.scheduleReconnect();
                return;
            }
            console.log(`[StateStream] Connected successfully for ${this.conversationId}.`);
            let buffer = Buffer.alloc(0);
            res.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                while (buffer.length >= 5) {
                    const flags = buffer[0];
                    const length = buffer.readUInt32BE(1);
                    if (buffer.length >= 5 + length) {
                        const messageBuffer = buffer.slice(5, 5 + length);
                        buffer = buffer.slice(5 + length);
                        try {
                            const messageStr = messageBuffer.toString('utf8');
                            const messageObj = JSON.parse(messageStr);
                            // Map/Flatten the update object to match expected client format
                            let mappedData = {};
                            if (messageObj.update) {
                                const update = messageObj.update;
                                mappedData = { ...update };
                                // Map status to state (expected by Android client: "THINKING" or "IDLE")
                                const status = update.status || 'CASCADE_RUN_STATUS_IDLE';
                                if (status === 'CASCADE_RUN_STATUS_RUNNING') {
                                    mappedData.state = 'THINKING';
                                }
                                else {
                                    mappedData.state = 'IDLE';
                                }
                            }
                            else if (messageObj.error) {
                                mappedData = {
                                    error: messageObj.error,
                                    state: 'IDLE'
                                };
                            }
                            else {
                                mappedData = {
                                    ...messageObj,
                                    state: 'IDLE'
                                };
                            }
                            // Ensure conversationId is always present
                            mappedData.conversationId = this.conversationId;
                            // DIAGNOSTIC: Log full requestedInteraction payload
                            if (mappedData.requestedInteraction) {
                                console.log('[StateStream] 🔍 requestedInteraction FULL PAYLOAD:');
                                console.log(JSON.stringify(mappedData.requestedInteraction, null, 2));
                                console.log('[StateStream] 🔍 requestedInteraction KEYS:', Object.keys(mappedData.requestedInteraction));
                            }
                            this.emit('state', mappedData);
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
                console.log(`[StateStream] Stream ended for ${this.conversationId}.`);
                this.req = null;
                this.scheduleReconnect();
            });
            res.on('error', (err) => {
                console.error(`[StateStream] Stream error for ${this.conversationId}:`, err);
                this.req = null;
                this.scheduleReconnect();
            });
        });
        this.req.on('error', (err) => {
            console.error(`[StateStream] Request error for ${this.conversationId}:`, err);
            this.req = null;
            this.scheduleReconnect();
        });
        this.req.write(envelope);
        this.req.end();
    }
    disconnect() {
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.req?.destroy();
        this.req = null;
    }
    scheduleReconnect() {
        if (this.reconnectTimer)
            clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, 3000);
    }
}
exports.AgentStateStream = AgentStateStream;
