"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callRPC = callRPC;
const https_1 = __importDefault(require("https"));
const discovery_1 = require("./discovery");
const agent = new https_1.default.Agent({ rejectUnauthorized: false });
async function callRPC(method, body = {}, options = {}) {
    const ls = (0, discovery_1.discoverLanguageServer)();
    if (!ls)
        return Promise.reject(new Error('Language Server not found'));
    const url = `https://127.0.0.1:${ls.httpsPort}/exa.language_server_pb.LanguageServerService/${method}`;
    const data = JSON.stringify(body);
    const timeoutMs = options.timeoutMs || 30000;
    return new Promise((resolve, reject) => {
        const req = https_1.default.request(url, {
            method: 'POST',
            agent,
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': ls.csrfToken,
                'Content-Length': Buffer.byteLength(data),
            },
        }, (res) => {
            let chunks = '';
            res.on('data', c => chunks += c);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(chunks);
                    if (parsed.code && parsed.code !== 'ok') {
                        reject(parsed);
                    }
                    else {
                        resolve(parsed);
                    }
                }
                catch {
                    reject(new Error(`Invalid JSON from LS: ${chunks.substring(0, 200)}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('RPC timeout')); });
        req.write(data);
        req.end();
    });
}
