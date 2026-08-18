import Bonjour, { Service } from 'bonjour-service';
import * as os from 'os';

let bonjourInstance: Bonjour;
let currentService: Service | undefined;

function getLocalIp(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        if (name.toLowerCase().includes('tailscale')) continue;
        const iface = interfaces[name];
        if (!iface) continue;
        for (const config of iface) {
            if (config.family === 'IPv4' && !config.internal) {
                return config.address;
            }
        }
    }
    return '0.0.0.0';
}

export function startDiscovery(port: number, serverId: string, version: string) {
    if (!bonjourInstance) {
        const ip = getLocalIp();
        console.log(`[mDNS] Initializing Bonjour on interface: ${ip}`);
        // @ts-ignore - bonjour-service types are incomplete but it passes options to multicast-dns
        bonjourInstance = new Bonjour({ interface: ip });
    }
    
    // Unpublish previous if any
    if (currentService) {
        currentService.stop(() => {
            currentService = undefined;
        });
    }

    const uniqueSuffix = Math.random().toString(36).substring(2, 6);
    currentService = bonjourInstance.publish({
        name: `Antigravity (${require('os').hostname()}-${uniqueSuffix})`,
        type: 'http',
        protocol: 'tcp',
        port: port,
        txt: { version: version, server_id: serverId }
    });
    
    if (currentService && typeof currentService.on === 'function') {
        currentService.on('error', (err: any) => {
            console.error('[mDNS] Publish error:', err.message);
        });
    }
    
    console.log(`[mDNS] Published _http._tcp.local on port ${port}`);
}

export function stopDiscovery() {
    if (currentService) {
        currentService.stop();
        currentService = undefined;
        console.log('[mDNS] Stopped service publication');
    }
}

export function destroyBonjour() {
    stopDiscovery();
    if (bonjourInstance) {
        bonjourInstance.destroy();
        bonjourInstance = undefined as any;
    }
}
