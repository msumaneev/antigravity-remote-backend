import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generatePairingToken, validatePairingToken, getPermanentToken, validatePermanentToken, resetTokens } from '../src/auth/tokens';

describe('Auth Tokens', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        resetTokens();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('generates a 5-minute pairing token', () => {
        const token = generatePairingToken();
        expect(token).toBeDefined();
        expect(validatePairingToken(token)).toBe(true);
    });

    it('expires pairing token after 5 minutes', () => {
        const token = generatePairingToken();
        vi.advanceTimersByTime(5 * 60 * 1000 + 1000); // 5 mins + 1 sec
        expect(validatePairingToken(token)).toBe(false);
    });

    it('exchanges pairing token for permanent token', () => {
        const pairingToken = generatePairingToken();
        const permanentToken = getPermanentToken(pairingToken);
        expect(permanentToken).toBeDefined();
        expect(validatePermanentToken(permanentToken)).toBe(true);
    });

    it('invalidates pairing token after exchange', () => {
        const pairingToken = generatePairingToken();
        getPermanentToken(pairingToken);
        expect(validatePairingToken(pairingToken)).toBe(false);
    });
});
