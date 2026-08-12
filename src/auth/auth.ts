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
    try {
        db.exec(`ALTER TABLE paired_devices ADD COLUMN allowed_project_id TEXT`);
    } catch (e) {
        // Column already exists, ignore
    }
    db.exec(`
        CREATE TABLE IF NOT EXISTS pending_invites (
            token TEXT PRIMARY KEY,
            name TEXT,
            allowed_project_ids TEXT,
            status TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            auth_token TEXT
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
    allowed_project_ids?: string[] | null;
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

export function verifyToken(token: string | null | undefined): { deviceId: string; deviceName: string; allowed_project_ids?: string[] | null } | null {
    if (!token) return null;

    try {
        const payload = jwt.verify(token, JWT_SECRET) as { deviceId: string; deviceName: string };
        
        // Check device still exists in DB
        const device = db.prepare('SELECT id, allowed_project_id FROM paired_devices WHERE id = ?').get(payload.deviceId) as any;
        if (!device) return null;

        // Update last_seen
        db.prepare('UPDATE paired_devices SET last_seen = ? WHERE id = ?').run(Date.now(), payload.deviceId);

        let allowed_project_ids: string[] | null = null;
        if (device.allowed_project_id) {
            try {
                allowed_project_ids = JSON.parse(device.allowed_project_id);
            } catch (e) {
                // fallback if it was a single string
                allowed_project_ids = [device.allowed_project_id];
            }
        }

        return { 
            deviceId: payload.deviceId, 
            deviceName: payload.deviceName,
            allowed_project_ids
        };
    } catch {
        return null;
    }
}

export function listDevices(): PairedDevice[] {
    const rows = db.prepare(
        'SELECT id, name, paired_at, last_seen, allowed_project_id FROM paired_devices ORDER BY paired_at DESC'
    ).all() as any[];

    return rows.map(row => {
        let allowed_project_ids: string[] | null = null;
        if (row.allowed_project_id) {
            try {
                allowed_project_ids = JSON.parse(row.allowed_project_id);
            } catch (e) {
                allowed_project_ids = [row.allowed_project_id];
            }
        }
        return {
            id: row.id,
            name: row.name,
            pairedAt: row.paired_at,
            lastSeen: row.last_seen,
            allowed_project_ids
        };
    });
}

export function removeDevice(deviceId: string): boolean {
    const result = db.prepare('DELETE FROM paired_devices WHERE id = ?').run(deviceId);
    return result.changes > 0;
}

export function restrictDevice(deviceId: string, projectIds: string[] | null): boolean {
    const serialized = projectIds ? JSON.stringify(projectIds) : null;
    const result = db.prepare('UPDATE paired_devices SET allowed_project_id = ? WHERE id = ?').run(serialized, deviceId);
    return result.changes > 0;
}

export function createGuestToken(name: string, allowedProjectIds: string[]): { token: string; deviceId: string } {
    const deviceId = crypto.randomUUID();
    const now = Date.now();
    const serialized = JSON.stringify(allowedProjectIds);

    db.prepare(
        'INSERT INTO paired_devices (id, name, paired_at, last_seen, allowed_project_id) VALUES (?, ?, ?, ?, ?)'
    ).run(deviceId, name, now, now, serialized);

    const token = jwt.sign(
        { deviceId, deviceName: name },
        JWT_SECRET
    );

    return { token, deviceId };
}

export function hasAnyPairedDevices(): boolean {
    const row = db.prepare('SELECT COUNT(*) as count FROM paired_devices').get() as any;
    return row.count > 0;
}

// ─── Invites ───────────────────────────────────────────────────────

export function createInvite(name: string | null, allowedProjectIds: string[] | null): string {
    const token = crypto.randomBytes(16).toString('hex');
    const now = Date.now();
    const serialized = allowedProjectIds ? JSON.stringify(allowedProjectIds) : '["*"]';
    
    db.prepare(
        'INSERT INTO pending_invites (token, name, allowed_project_ids, status, created_at, auth_token) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(token, name || 'Guest', serialized, 'CREATED', now, null);
    
    return token;
}

export function requestInvite(token: string, guestName: string): boolean {
    const invite = db.prepare('SELECT status FROM pending_invites WHERE token = ?').get(token) as any;
    if (!invite) return false;
    if (invite.status === 'APPROVED' || invite.status === 'REJECTED') return false;
    
    db.prepare('UPDATE pending_invites SET name = ?, status = ? WHERE token = ?').run(guestName, 'PENDING', token);
    return true;
}

export function getInviteStatus(token: string): any {
    const invite = db.prepare('SELECT status, auth_token FROM pending_invites WHERE token = ?').get(token) as any;
    if (!invite) return null;
    return invite;
}

export function getPendingInvites(): any[] {
    return db.prepare('SELECT token, name, allowed_project_ids, created_at FROM pending_invites WHERE status = ? ORDER BY created_at ASC').all('PENDING') as any[];
}

export function approveInvite(token: string): boolean {
    const invite = db.prepare('SELECT name, allowed_project_ids FROM pending_invites WHERE token = ?').get(token) as any;
    if (!invite) return false;
    
    let allowed = ['*'];
    try { allowed = JSON.parse(invite.allowed_project_ids); } catch(e) {}
    
    const { token: jwtToken } = createGuestToken(invite.name, allowed);
    
    db.prepare('UPDATE pending_invites SET status = ?, auth_token = ? WHERE token = ?').run('APPROVED', jwtToken, token);
    return true;
}

export function rejectInvite(token: string): boolean {
    const result = db.prepare('UPDATE pending_invites SET status = ? WHERE token = ?').run('REJECTED', token);
    return result.changes > 0;
}
