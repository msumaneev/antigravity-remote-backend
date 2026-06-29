import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupRoutes } from './api/handlers';
import { initDiscovery } from './agentapi/discovery';
import { authMiddleware } from './auth/authMiddleware';
import { startDiscovery } from './discovery';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';

// Read version from package.json
const packageJsonPath = path.join(__dirname, '../package.json');
let SERVER_VERSION = '2.0.0';
try {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    if (pkg.version) SERVER_VERSION = pkg.version;
} catch (e) {
    console.error('Failed to read package.json version', e);
}

dotenv.config();
import crypto from 'crypto';
let SERVER_ID = process.env.SERVER_ID;
if (!SERVER_ID) {
    const idFile = path.join(__dirname, '../../.server_id');
    try {
        if (fs.existsSync(idFile)) {
            SERVER_ID = fs.readFileSync(idFile, 'utf8').trim();
        } else {
            SERVER_ID = crypto.randomUUID();
            fs.writeFileSync(idFile, SERVER_ID, 'utf8');
        }
    } catch (e) {
        SERVER_ID = crypto.randomUUID();
    }
}

initDiscovery(); // Discover Language Server at startup (sync, one-time)

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
wss.on('error', (err: any) => {
    console.error('[WebSocketServer] Error:', err.message);
});

// CORS: allow only localhost and private network ranges
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        // Allow localhost, 192.168.x.x, 10.x.x.x, 100.x.x.x (Tailscale)
        if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|100\.)/i.test(origin)) {
            return callback(null, true);
        }
        callback(new Error('CORS not allowed'));
    }
}));
app.use(express.json());

// Rate limit on pairing endpoint (5 attempts per minute per IP)
const pairLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Too many pairing attempts, try again later', code: 'RATE_LIMITED' },
    standardHeaders: true,
    legacyHeaders: false,
});
// app.use('/api/pair', pairLimiter); // Commented out because it causes 404s

// Authentication middleware (before routes)
app.use(authMiddleware);

// Set up REST API routes
setupRoutes(app, wss);

import os from 'os';

let prevCpus = os.cpus();

function getSystemCpuUsagePercent(): number {
    const cpus = os.cpus();
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
            total += (cpu.times as any)[type];
            prevTotal += (prevCpu.times as any)[type];
        }

        idleDiff += (idle - prevIdle);
        totalDiff += (total - prevTotal);
    }

    prevCpus = cpus;

    if (totalDiff === 0) return 0;
    return 100 - Math.floor((idleDiff / totalDiff) * 100);
}

setInterval(() => {
    if (wss.clients.size === 0) return;

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
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
        if (client.readyState === 1 && (client as any).subscribedToStats) { // 1 = OPEN
            client.send(payload);
        }
    });
}, 3000);
const initialPort = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

import readline from 'readline';

function getTailscaleIp(): string | null {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const ifaces = interfaces[name];
        if (!ifaces) continue;
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

function getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        const ifaces = interfaces[name];
        if (!ifaces) continue;
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

function startServer(port: number) {
    server.listen(port, HOST)
        .on('listening', () => {
            const ipToShow = getTailscaleIp() || getLocalIp();
            
            // Start mDNS discovery
            startDiscovery(port, SERVER_ID as string, SERVER_VERSION);

            console.log(`=================================================`);
            console.log(`🚀 Antigravity Remote Backend is RUNNING`);
            console.log(`=================================================`);
            console.log(`\n📱 Open http://localhost:${port} to view the pairing QR code\n`);
            console.log(`   IP Address : ${ipToShow}`);
            console.log(`   Port       : ${port}`);
            console.log(`\n=================================================\n`);
        })
        .on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`[Daemon] Port ${port} is in use, trying ${port + 1}...`);
                startServer(port + 1);
            } else {
                console.error('[Daemon] Server error:', err);
            }
        });
}

function checkTailscaleAndStart() {
    const tsIp = getTailscaleIp();
    if (!tsIp) {
        const rl = readline.createInterface({
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
            } else {
                console.log('Exiting...');
                process.exit(0);
            }
        });
    } else {
        startServer(initialPort);
    }
}

checkTailscaleAndStart();
