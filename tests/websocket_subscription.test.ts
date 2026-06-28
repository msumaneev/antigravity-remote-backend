import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { setupRoutes } from '../src/api/handlers';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'antigravity_secret_key_change_me_in_production';

describe('WebSocket Subscription Protocol', () => {
    let app: any;
    let server: any;
    let wss: any;
    let ws: WebSocket;
    let PORT = 8089;
    let intervalId: any;

    beforeAll(async () => {
        app = express();
        server = http.createServer(app);
        wss = new WebSocketServer({ server });
        setupRoutes(app, wss);
        
        // Simulate the interval broadcast from index.ts
        intervalId = setInterval(() => {
            wss.clients.forEach((client: any) => {
                if (client.readyState === 1 && client.subscribedToStats) {
                    client.send(JSON.stringify({ type: 'SERVER_STATS', data: { cpu: 10, ram: 20, version: '2.0.0' } }));
                }
            });
        }, 100); // 100ms interval for fast testing

        // Force authenticate all connections for testing
        wss.on('connection', (client: any) => {
            client.authenticated = true;
            client.deviceId = 'test-device';
        });

        await new Promise<void>((resolve) => {
            server.listen(PORT, () => {
                ws = new WebSocket(`ws://localhost:${PORT}`);
                ws.on('open', () => {
                    resolve();
                });
            });
        });
    });

    afterAll(async () => {
        clearInterval(intervalId);
        ws.close();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    });

    it('should NOT receive SERVER_STATS by default', async () => {
        let statsReceived = false;
        const listener = (data: Buffer) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'SERVER_STATS') statsReceived = true;
            } catch (e) {}
        };
        ws.on('message', listener);
        await new Promise(r => setTimeout(r, 300));
        ws.off('message', listener);
        expect(statsReceived).toBe(false);
    });

    it('should receive SERVER_STATS after subscribing', async () => {
        let statsReceived = false;
        const listener = (data: Buffer) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'SERVER_STATS') statsReceived = true;
            } catch (e) {}
        };
        ws.on('message', listener);
        ws.send(JSON.stringify({ type: 'SUBSCRIBE_STATS' }));
        await new Promise(r => setTimeout(r, 300));
        ws.off('message', listener);
        expect(statsReceived).toBe(true);
    });

    it('should NOT receive SERVER_STATS after unsubscribing', async () => {
        let statsReceived = false;
        ws.send(JSON.stringify({ type: 'UNSUBSCRIBE_STATS' }));
        const listener = (data: Buffer) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'SERVER_STATS') statsReceived = true;
            } catch (e) {}
        };
        await new Promise(r => setTimeout(r, 100)); // wait for unsubscribe to process
        ws.on('message', listener);
        await new Promise(r => setTimeout(r, 300));
        ws.off('message', listener);
        expect(statsReceived).toBe(false);
    });
});
