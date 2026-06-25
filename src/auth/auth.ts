import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import dotenv from 'dotenv';

// ─── Config ────────────────────────────────────────────────────────
const GEMINI_DIR = path.join(os.homedir(), '.gemini');
const AUTH_DB_PATH = path.join(GEMINI_DIR, 'antigravity', 'auth.db');
const ENV_PATH = path.join(__dirname, '../../.env');
const PAIRING_CODE_ROTATION_MS = 5 * 60 * 1000; // 5 minutes

// ─── JWT Secret ────────────────────────────────────────────────────
function getOrCreateJwtSecret(): string {
    dotenv.config({ path: ENV_PATH });
    if (process.env.JWT_SECRET) {
        return process.env.JWT_SECRET;
    }

    const secret = crypto.randomBytes(64).toString('hex');
    const envLine = `JWT_SECRET=${secret}\n`;

    if (fs.existsSync(ENV_PATH)) {
        fs.appendFileSync(ENV_PATH, envLine);
    } else {
        fs.writeFileSync(ENV_PATH, envLine);
    }

    process.env.JWT_SECRET = secret;
    return secret;
}

const JWT_SECRET = getOrCreateJwtSecret();

// ─── SQLite Database ───────────────────────────────────────────────
function getDb(): Database.Database {
    const dir = path.dirname(AUTH_DB_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const db = new Database(AUTH_DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
        CREATE TABLE IF NOT EXISTS paired_devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            paired_at INTEGER NOT NULL,
            last_seen INTEGER
        )
    `);
    return db;
}

// Initialize DB on module load
const db = getDb();

// ─── Pairing Code ──────────────────────────────────────────────────
let currentPairingCode: string = '';
let codeRotationTimer: ReturnType<typeof setInterval> | null = null;

export function generatePairingCode(): string {
    // 6-digit numeric code
    currentPairingCode = String(Math.floor(100000 + Math.random() * 900000));
    return currentPairingCode;
}

export function getCurrentPairingCode(): string {
    return currentPairingCode;
}

export function verifyPairingCode(code: string): boolean {
    if (!currentPairingCode) return false;
    // Constant-time comparison to prevent timing attacks
    const a = Buffer.from(code.padEnd(6, '0'));
    const b = Buffer.from(currentPairingCode.padEnd(6, '0'));
    return crypto.timingSafeEqual(a, b);
}

export function startPairingCodeRotation(onRotate?: (code: string) => void): void {
    // Generate initial code
    const initialCode = generatePairingCode();
    if (onRotate) onRotate(initialCode);

    // Rotate every N minutes
    codeRotationTimer = setInterval(() => {
        const newCode = generatePairingCode();
        if (onRotate) onRotate(newCode);
    }, PAIRING_CODE_ROTATION_MS);
}

export function stopPairingCodeRotation(): void {
    if (codeRotationTimer) {
        clearInterval(codeRotationTimer);
        codeRotationTimer = null;
    }
}

// ─── Device Management ─────────────────────────────────────────────
export interface PairedDevice {
    id: string;
    name: string;
    pairedAt: number;
    lastSeen: number | null;
}

export function pairDevice(deviceName: string): { token: string; deviceId: string } {
    const deviceId = crypto.randomUUID();
    const now = Date.now();

    db.prepare(
        'INSERT INTO paired_devices (id, name, paired_at, last_seen) VALUES (?, ?, ?, ?)'
    ).run(deviceId, deviceName, now, now);

    const token = jwt.sign(
        { deviceId, deviceName },
        JWT_SECRET
        // No expiresIn — token valid until device is removed
    );

    return { token, deviceId };
}

export function verifyToken(token: string | null | undefined): { deviceId: string; deviceName: string } | null {
    if (!token) return null;

    try {
        const payload = jwt.verify(token, JWT_SECRET) as { deviceId: string; deviceName: string };
        
        // Check device still exists in DB
        const device = db.prepare('SELECT id FROM paired_devices WHERE id = ?').get(payload.deviceId) as any;
        if (!device) return null;

        // Update last_seen
        db.prepare('UPDATE paired_devices SET last_seen = ? WHERE id = ?').run(Date.now(), payload.deviceId);

        return { deviceId: payload.deviceId, deviceName: payload.deviceName };
    } catch {
        return null;
    }
}

export function listDevices(): PairedDevice[] {
    const rows = db.prepare(
        'SELECT id, name, paired_at, last_seen FROM paired_devices ORDER BY paired_at DESC'
    ).all() as any[];

    return rows.map(row => ({
        id: row.id,
        name: row.name,
        pairedAt: row.paired_at,
        lastSeen: row.last_seen,
    }));
}

export function removeDevice(deviceId: string): boolean {
    const result = db.prepare('DELETE FROM paired_devices WHERE id = ?').run(deviceId);
    return result.changes > 0;
}

export function hasAnyPairedDevices(): boolean {
    const row = db.prepare('SELECT COUNT(*) as count FROM paired_devices').get() as any;
    return row.count > 0;
}
