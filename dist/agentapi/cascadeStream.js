"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CascadeReactiveStream = void 0;
const events_1 = require("events");
const https_1 = __importDefault(require("https"));
const discovery_1 = require("./discovery");
class CascadeReactiveStream extends events_1.EventEmitter {
    cascadeId;
    req = null;
    reconnectTimer = null;
    constructor(cascadeId) {
        super();
        this.cascadeId = cascadeId;
    }
    connect() {
        const ls = (0, discovery_1.discoverLanguageServer)();
        if (!ls)
            return;
        // HTTPS POST с Envelope-ответом
        const postData = JSON.stringify({ cascadeId: this.cascadeId });
        this.req = https_1.default.request({
            hostname: '127.0.0.1',
            port: ls.httpsPort,
            path: '/exa.language_server_pb.LanguageServerService/StreamCascadeReactiveUpdates',
            method: 'POST',
            headers: {
                'Content-Type': 'application/connect+json',
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': ls.csrfToken,
            },
            rejectUnauthorized: false,
        }, (res) => {
            let buffer = Buffer.alloc(0);
            res.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                // Parse Connect-RPC envelope: [flag(1)][len(4BE)][json]
                while (buffer.length >= 5) {
                    const flag = buffer[0];
                    const len = buffer.readUInt32BE(1);
                    if (buffer.length < 5 + len)
                        break;
                    const payload = buffer.subarray(5, 5 + len).toString('utf-8');
                    buffer = buffer.subarray(5 + len);
                    try {
                        const data = JSON.parse(payload);
                        this.emit('update', data);
                    }
                    catch { }
                }
            });
            res.on('end', () => this.scheduleReconnect());
        });
        this.req.on('error', () => this.scheduleReconnect());
        this.req.write(postData);
        this.req.end();
    }
    disconnect() {
        clearTimeout(this.reconnectTimer);
        this.req?.destroy();
    }
    scheduleReconnect() {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    }
}
exports.CascadeReactiveStream = CascadeReactiveStream;
