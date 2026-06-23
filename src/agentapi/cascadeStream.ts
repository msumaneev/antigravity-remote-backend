import { EventEmitter } from 'events';
import https from 'https';
import { discoverLanguageServer } from './discovery';

export class CascadeReactiveStream extends EventEmitter {
  private cascadeId: string;
  private req: any = null;
  private reconnectTimer: any = null;

  constructor(cascadeId: string) {
    super();
    this.cascadeId = cascadeId;
  }

  connect() {
    const ls = discoverLanguageServer();
    if (!ls) return;
    
    // HTTPS POST с Envelope-ответом
    const postData = JSON.stringify({ cascadeId: this.cascadeId });
    this.req = https.request({
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
      res.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        // Parse Connect-RPC envelope: [flag(1)][len(4BE)][json]
        while (buffer.length >= 5) {
          const flag = buffer[0];
          const len = buffer.readUInt32BE(1);
          if (buffer.length < 5 + len) break;
          const payload = buffer.subarray(5, 5 + len).toString('utf-8');
          buffer = buffer.subarray(5 + len);
          try {
            const data = JSON.parse(payload);
            this.emit('update', data);
          } catch {}
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

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => this.connect(), 3000);
  }
}
