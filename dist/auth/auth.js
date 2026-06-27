"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePairingCode = generatePairingCode;
exports.getCurrentPairingCode = getCurrentPairingCode;
exports.verifyPairingCode = verifyPairingCode;
exports.startPairingCodeRotation = startPairingCodeRotation;
exports.stopPairingCodeRotation = stopPairingCodeRotation;
exports.pairDevice = pairDevice;
exports.verifyToken = verifyToken;
exports.listDevices = listDevices;
exports.removeDevice = removeDevice;
exports.hasAnyPairedDevices = hasAnyPairedDevices;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
// ─── Config ────────────────────────────────────────────────────────
const GEMINI_DIR = path_1.default.join(os_1.default.homedir(), '.gemini');
const AUTH_DB_PATH = path_1.default.join(GEMINI_DIR, 'antigravity', 'auth.db');
const ENV_PATH = path_1.default.join(__dirname, '../../.env');
const PAIRING_CODE_ROTATION_MS = 5 * 60 * 1000; // 5 minutes
// ─── JWT Secret ────────────────────────────────────────────────────
function getOrCreateJwtSecret() {
    dotenv_1.default.config({ path: ENV_PATH });
    if (process.env.JWT_SECRET) {
        return process.env.JWT_SECRET;
    }
    const secret = crypto_1.default.randomBytes(64).toString('hex');
    const envLine = `JWT_SECRET=${secret}\n`;
    if (fs_1.default.existsSync(ENV_PATH)) {
        fs_1.default.appendFileSync(ENV_PATH, envLine);
    }
    else {
        fs_1.default.writeFileSync(ENV_PATH, envLine);
    }
    process.env.JWT_SECRET = secret;
    return secret;
}
const JWT_SECRET = getOrCreateJwtSecret();
// ─── SQLite Database ───────────────────────────────────────────────
function getDb() {
    const dir = path_1.default.dirname(AUTH_DB_PATH);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    const db = new better_sqlite3_1.default(AUTH_DB_PATH);
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
let currentPairingCode = '';
let codeRotationTimer = null;
function generatePairingCode() {
    // 6-digit numeric code
    currentPairingCode = String(Math.floor(100000 + Math.random() * 900000));
    return currentPairingCode;
}
function getCurrentPairingCode() {
    return currentPairingCode;
}
function verifyPairingCode(code) {
    if (!currentPairingCode)
        return false;
    // Constant-time comparison to prevent timing attacks
    const a = Buffer.from(code.padEnd(6, '0'));
    const b = Buffer.from(currentPairingCode.padEnd(6, '0'));
    return crypto_1.default.timingSafeEqual(a, b);
}
function startPairingCodeRotation(onRotate) {
    // Generate initial code
    const initialCode = generatePairingCode();
    if (onRotate)
        onRotate(initialCode);
    // Rotate every N minutes
    codeRotationTimer = setInterval(() => {
        const newCode = generatePairingCode();
        if (onRotate)
            onRotate(newCode);
    }, PAIRING_CODE_ROTATION_MS);
}
function stopPairingCodeRotation() {
    if (codeRotationTimer) {
        clearInterval(codeRotationTimer);
        codeRotationTimer = null;
    }
}
function pairDevice(deviceName) {
    const deviceId = crypto_1.default.randomUUID();
    const now = Date.now();
    db.prepare('INSERT INTO paired_devices (id, name, paired_at, last_seen) VALUES (?, ?, ?, ?)').run(deviceId, deviceName, now, now);
    const token = jsonwebtoken_1.default.sign({ deviceId, deviceName }, JWT_SECRET
    // No expiresIn — token valid until device is removed
    );
    return { token, deviceId };
}
function verifyToken(token) {
    if (!token)
        return null;
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        // Check device still exists in DB
        const device = db.prepare('SELECT id FROM paired_devices WHERE id = ?').get(payload.deviceId);
        if (!device)
            return null;
        // Update last_seen
        db.prepare('UPDATE paired_devices SET last_seen = ? WHERE id = ?').run(Date.now(), payload.deviceId);
        return { deviceId: payload.deviceId, deviceName: payload.deviceName };
    }
    catch {
        return null;
    }
}
function listDevices() {
    const rows = db.prepare('SELECT id, name, paired_at, last_seen FROM paired_devices ORDER BY paired_at DESC').all();
    return rows.map(row => ({
        id: row.id,
        name: row.name,
        pairedAt: row.paired_at,
        lastSeen: row.last_seen,
    }));
}
function removeDevice(deviceId) {
    const result = db.prepare('DELETE FROM paired_devices WHERE id = ?').run(deviceId);
    return result.changes > 0;
}
function hasAnyPairedDevices() {
    const row = db.prepare('SELECT COUNT(*) as count FROM paired_devices').get();
    return row.count > 0;
}
