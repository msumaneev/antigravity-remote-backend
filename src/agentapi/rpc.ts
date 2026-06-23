import https from 'https';
import { discoverLanguageServer } from './discovery';

const agent = new https.Agent({ rejectUnauthorized: false });

export interface RPCError {
  code: string;
  message: string;
}

export async function callRPC<T = any>(method: string, body: object = {}, options: { timeoutMs?: number } = {}): Promise<T> {
  const ls = discoverLanguageServer();
  if (!ls) throw new Error('Language Server not found');

  const url = `https://127.0.0.1:${ls.httpsPort}/exa.language_server_pb.LanguageServerService/${method}`;
  const data = JSON.stringify(body);
  const timeoutMs = options.timeoutMs || 30000;

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
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
            reject(parsed as RPCError);
          } else {
            resolve(parsed as T);
          }
        } catch {
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
