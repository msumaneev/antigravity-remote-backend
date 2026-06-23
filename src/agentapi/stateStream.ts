import https from 'https';
import { EventEmitter } from 'events';
import { discoverLanguageServer } from './discovery';

class AgentStateStream extends EventEmitter {
    private req: any = null;
    private reconnectTimer: NodeJS.Timeout | null = null;

    connect() {
        if (this.req) return;

        const ls = discoverLanguageServer();
        if (!ls) {
            this.scheduleReconnect();
            return;
        }

        console.log('[StateStream] Connecting to StreamAgentStateUpdates...');
        this.req = https.request({
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
                console.error(`[StateStream] Connection failed with status ${res.statusCode}`);
                this.req = null;
                this.scheduleReconnect();
                return;
            }

            console.log('[StateStream] Connected successfully.');
            let buffer = Buffer.alloc(0);

            res.on('data', (chunk: Buffer) => {
                buffer = Buffer.concat([buffer, chunk]);
                
                // Parse Connect-RPC Envelope: [Flag(1)][Length(4)][Message...]
                while (buffer.length >= 5) {
                    const flags = buffer[0];
                    const length = buffer.readUInt32BE(1);
                    
                    if (buffer.length >= 5 + length) {
                        const messageBuffer = buffer.slice(5, 5 + length);
                        buffer = buffer.slice(5 + length);
                        
                        try {
                            const messageStr = messageBuffer.toString('utf8');
                            const messageObj = JSON.parse(messageStr);
                            this.emit('state', messageObj);
                        } catch (err) {
                            console.error('[StateStream] Error parsing message:', err);
                        }
                    } else {
                        break;
                    }
                }
            });

            res.on('end', () => {
                console.log('[StateStream] Stream ended.');
                this.req = null;
                this.scheduleReconnect();
            });
            
            res.on('error', (err: Error) => {
                console.error('[StateStream] Stream error:', err);
                this.req = null;
                this.scheduleReconnect();
            });
        });

        this.req.on('error', (err: Error) => {
            console.error('[StateStream] Request error:', err);
            this.req = null;
            this.scheduleReconnect();
        });

        // Send empty payload
        this.req.write(Buffer.from([0, 0, 0, 0, 2, 123, 125])); // Envelope for "{}"
        this.req.end();
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, 3000);
    }
}

export const agentStateStream = new AgentStateStream();
