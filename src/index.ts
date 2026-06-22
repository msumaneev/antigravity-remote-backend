import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';
import { setupRoutes } from './api/handlers';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Set up REST API routes
setupRoutes(app, wss);

import os from 'os';

const initialPort = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';

function getTailscaleIp(): string {
    const interfaces = os.networkInterfaces();
    // First try to find a Tailscale IP (100.x.x.x)
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
    // Fallback to any non-internal IPv4
    for (const name of Object.keys(interfaces)) {
        const ifaces = interfaces[name];
        if (!ifaces) continue;
        for (const iface of ifaces) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function startServer(port: number) {
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
        .on('error', (err: any) => {
            if (err.code === 'EADDRINUSE') {
                console.log(`[Daemon] Port ${port} is in use, trying ${port + 1}...`);
                startServer(port + 1);
            } else {
                console.error('[Daemon] Server error:', err);
            }
        });
}

startServer(initialPort);
