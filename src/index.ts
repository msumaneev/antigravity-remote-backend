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

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT as number, HOST, () => {
    console.log(`[Daemon] Server is running on http://${HOST}:${PORT}`);
    console.log(`[Daemon] WebSocket endpoint ready on ws://${HOST}:${PORT}`);
});
