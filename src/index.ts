import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupRoutes } from './api/handlers';
import { initDiscovery } from './agentapi/discovery';

dotenv.config();
initDiscovery(); // Discover Language Server at startup (sync, one-time)

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

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
            ram: ramPercent
        }
    });

    wss.clients.forEach(client => {
        if (client.readyState === 1) { // 1 = OPEN
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
            console.log(`\n=================================================`);
            console.log(`🚀 Antigravity Remote Backend is RUNNING`);
            console.log(`=================================================`);
            console.log(`\n📱 Enter these settings in your Android App:\n`);
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
