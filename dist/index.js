"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const handlers_1 = require("./api/handlers");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Set up REST API routes
(0, handlers_1.setupRoutes)(app, wss);
const os_1 = __importDefault(require("os"));
const initialPort = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
function getTailscaleIp() {
    const interfaces = os_1.default.networkInterfaces();
    // First try to find a Tailscale IP (100.x.x.x)
    for (const name of Object.keys(interfaces)) {
        const ifaces = interfaces[name];
        if (!ifaces)
            continue;
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith('100.')) {
                    return iface.address;
                }
            }
        }
    }
    // Fallback to any non-internal IPv4
    for (const name of Object.keys(interfaces)) {
        const ifaces = interfaces[name];
        if (!ifaces)
            continue;
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}
function startServer(port) {
    server.listen(port, HOST)
        .on('listening', () => {
        const tailscaleIp = getTailscaleIp();
        console.log(`\n=================================================`);
        console.log(`🚀 Antigravity Remote Backend is RUNNING`);
        console.log(`=================================================`);
        console.log(`\n📱 Enter these settings in your Android App:\n`);
        console.log(`   IP Address : ${tailscaleIp}`);
        console.log(`   Port       : ${port}`);
        console.log(`\n=================================================\n`);
    })
        .on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[Daemon] Port ${port} is in use, trying ${port + 1}...`);
            startServer(port + 1);
        }
        else {
            console.error('[Daemon] Server error:', err);
        }
    });
}
startServer(initialPort);
