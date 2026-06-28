"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDiscovery = startDiscovery;
exports.stopDiscovery = stopDiscovery;
exports.destroyBonjour = destroyBonjour;
const bonjour_service_1 = __importDefault(require("bonjour-service"));
const os = __importStar(require("os"));
let bonjourInstance;
let currentService;
function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        if (name.toLowerCase().includes('tailscale'))
            continue;
        const iface = interfaces[name];
        if (!iface)
            continue;
        for (const config of iface) {
            if (config.family === 'IPv4' && !config.internal) {
                return config.address;
            }
        }
    }
    return '0.0.0.0';
}
function startDiscovery(port, serverId, version) {
    if (!bonjourInstance) {
        const ip = getLocalIp();
        console.log(`[mDNS] Initializing Bonjour on interface: ${ip}`);
        // @ts-ignore - bonjour-service types are incomplete but it passes options to multicast-dns
        bonjourInstance = new bonjour_service_1.default({ interface: ip });
    }
    // Unpublish previous if any
    if (currentService) {
        currentService.stop(() => {
            currentService = undefined;
        });
    }
    currentService = bonjourInstance.publish({
        name: `Antigravity (${require('os').hostname()})`,
        type: 'http',
        protocol: 'tcp',
        port: port,
        txt: { version: version, server_id: serverId }
    });
    console.log(`[mDNS] Published _http._tcp.local on port ${port}`);
}
function stopDiscovery() {
    if (currentService) {
        currentService.stop();
        currentService = undefined;
        console.log('[mDNS] Stopped service publication');
    }
}
function destroyBonjour() {
    stopDiscovery();
    if (bonjourInstance) {
        bonjourInstance.destroy();
        bonjourInstance = undefined;
    }
}
