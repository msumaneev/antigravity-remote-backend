import { v4 as uuidv4 } from 'uuid';

// In-memory token stores (could be persisted to disk later)
const pairingTokens = new Map<string, number>(); // token -> expiry timestamp
const permanentTokens = new Set<string>(); // set of valid permanent tokens

const PAIRING_TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export function generatePairingToken(): string {
    const token = uuidv4();
    pairingTokens.set(token, Date.now() + PAIRING_TOKEN_EXPIRY_MS);
    return token;
}

export function validatePairingToken(token: string): boolean {
    const expiry = pairingTokens.get(token);
    if (!expiry) return false;
    
    if (Date.now() > expiry) {
        pairingTokens.delete(token); // Cleanup expired
        return false;
    }
    
    return true;
}

export function getPermanentToken(pairingToken: string): string | null {
    if (!validatePairingToken(pairingToken)) {
        return null;
    }
    
    // Invalidate the pairing token once used
    pairingTokens.delete(pairingToken);
    
    const permanentToken = uuidv4();
    permanentTokens.add(permanentToken);
    return permanentToken;
}

export function validatePermanentToken(token: string): boolean {
    return permanentTokens.has(token);
}

// For testing
export function resetTokens() {
    pairingTokens.clear();
    permanentTokens.clear();
}
