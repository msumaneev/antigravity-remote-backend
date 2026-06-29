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
const discovery_1 = require("./agentapi/discovery");
const authMiddleware_1 = require("./auth/authMiddleware");
const discovery_2 = require("./discovery");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Read version from package.json
const packageJsonPath = path_1.default.join(__dirname, '../package.json');
let SERVER_VERSION = '2.0.0';
try {
    const pkg = JSON.parse(fs_1.default.readFileSync(packageJsonPath, 'utf-8'));
    if (pkg.version)
        SERVER_VERSION = pkg.version;
}
catch (e) {
    console.error('Failed to read package.json version', e);
}
dotenv_1.default.config();
const crypto_1 = __importDefault(require("crypto"));
let SERVER_ID = process.env.SERVER_ID;
if (!SERVER_ID) {
    const idFile = path_1.default.join(__dirname, '../../.server_id');
    try {
        if (fs_1.default.existsSync(idFile)) {
            SERVER_ID = fs_1.default.readFileSync(idFile, 'utf8').trim();
        }
        else {
            SERVER_ID = crypto_1.default.randomUUID();
            fs_1.default.writeFileSync(idFile, SERVER_ID, 'utf8');
        }
    }
    catch (e) {
        SERVER_ID = crypto_1.default.randomUUID();
    }
}
(0, discovery_1.initDiscovery)(); // Discover Language Server at startup (sync, one-time)
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
wss.on('error', (err) => {
    console.error('[WebSocketServer] Error:', err.message);
});
// CORS: allow only localhost and private network ranges
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin)
            return callback(null, true);
        // Allow localhost, 192.168.x.x, 10.x.x.x, 100.x.x.x (Tailscale)
        if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|100\.)/i.test(origin)) {
            return callback(null, true);
        }
        callback(new Error('CORS not allowed'));
    }
}));
app.use(express_1.default.json());
// Rate limit on pairing endpoint (5 attempts per minute per IP)
const pairLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Too many pairing attempts, try again later', code: 'RATE_LIMITED' },
    standardHeaders: true,
    legacyHeaders: false,
});
// app.use('/api/pair', pairLimiter); // Commented out because it causes 404s
// Authentication middleware (before routes)
app.use(authMiddleware_1.authMiddleware);
// Set up REST API routes
(0, handlers_1.setupRoutes)(app, wss);
const os_1 = __importDefault(require("os"));
let prevCpus = os_1.default.cpus();
function getSystemCpuUsagePercent() {
    const cpus = os_1.default.cpus();
    let idleDiff = 0;
    let totalDiff = 0;
    for (let i = 0; i < cpus.length; i++) {
        const cpu = cpus[i];
        const prevCpu = prevCpus[i];
        let idle = cpu.times.idle;
        let prevIdle = prevCpu.times.idle;
        let total = 0;
        let prevTotal = 0;
        for (const type in cpu.times) {
            total += cpu.times[type];
            prevTotal += prevCpu.times[type];
        }
        idleDiff += (idle - prevIdle);
        totalDiff += (total - prevTotal);
    }
    prevCpus = cpus;
    if (totalDiff === 0)
        return 0;
    return 100 - Math.floor((idleDiff / totalDiff) * 100);
}
setInterval(() => {
    if (wss.clients.size === 0)
        return;
    const totalMem = os_1.default.totalmem();
    const freeMem = os_1.default.freemem();
    const usedMem = totalMem - freeMem;
    const ramPercent = Math.floor((usedMem / totalMem) * 100);
    const cpuPercent = getSystemCpuUsagePercent();
    const payload = JSON.stringify({
        type: 'SERVER_STATS',
        data: {
            cpu: cpuPercent,
            ram: ramPercent,
            version: SERVER_VERSION
        }
    });
    wss.clients.forEach(client => {
        if (client.readyState === 1 && client.subscribedToStats) { // 1 = OPEN
            client.send(payload);
        }
    });
}, 3000);
const initialPort = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const readline_1 = __importDefault(require("readline"));
function getTailscaleIp() {
    const interfaces = os_1.default.networkInterfaces();
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
    return null;
}
function getLocalIp() {
    const interfaces = os_1.default.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const ifaces = interfaces[name];
        if (!ifaces)
            continue;
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (!iface.address.startsWith('100.')) {
                    return iface.address;
                }
            }
        }
    }
    return '127.0.0.1';
}
function startServer(port) {
    server.listen(port, HOST)
        .on('listening', () => {
        const ipToShow = getTailscaleIp() || getLocalIp();
        // Start mDNS discovery
        (0, discovery_2.startDiscovery)(port, SERVER_ID, SERVER_VERSION);
        console.log(`=================================================`);
        console.log(`🚀 Antigravity Remote Backend is RUNNING`);
        console.log(`=================================================`);
        console.log(`\n📱 Open http://localhost:${port} to view the pairing QR code\n`);
        console.log(`   IP Address : ${ipToShow}`);
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
function checkTailscaleAndStart() {
    const tsIp = getTailscaleIp();
    if (!tsIp) {
        const rl = readline_1.default.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        console.log('\n⚠️  Tailscale is NOT detected on your system.');
        console.log('To connect to Antigravity Remote securely from anywhere, we highly recommend installing Tailscale.');
        console.log('Download it from: https://tailscale.com/download');
        rl.question('\nWould you like to continue using your local network IP anyway? (y/n): ', (answer) => {
            rl.close();
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
                startServer(initialPort);
            }
            else {
                console.log('Exiting...');
                process.exit(0);
            }
        });
    }
    else {
        startServer(initialPort);
    }
}
checkTailscaleAndStart();
