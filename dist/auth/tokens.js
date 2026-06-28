"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePairingToken = generatePairingToken;
exports.validatePairingToken = validatePairingToken;
exports.getPermanentToken = getPermanentToken;
exports.validatePermanentToken = validatePermanentToken;
exports.resetTokens = resetTokens;
const uuid_1 = require("uuid");
// In-memory token stores (could be persisted to disk later)
const pairingTokens = new Map(); // token -> expiry timestamp
const permanentTokens = new Set(); // set of valid permanent tokens
const PAIRING_TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
function generatePairingToken() {
    const token = (0, uuid_1.v4)();
    pairingTokens.set(token, Date.now() + PAIRING_TOKEN_EXPIRY_MS);
    return token;
}
function validatePairingToken(token) {
    const expiry = pairingTokens.get(token);
    if (!expiry)
        return false;
    if (Date.now() > expiry) {
        pairingTokens.delete(token); // Cleanup expired
        return false;
    }
    return true;
}
function getPermanentToken(pairingToken) {
    if (!validatePairingToken(pairingToken)) {
        return null;
    }
    // Invalidate the pairing token once used
    pairingTokens.delete(pairingToken);
    const permanentToken = (0, uuid_1.v4)();
    permanentTokens.add(permanentToken);
    return permanentToken;
}
function validatePermanentToken(token) {
    return permanentTokens.has(token);
}
// For testing
function resetTokens() {
    pairingTokens.clear();
    permanentTokens.clear();
}
