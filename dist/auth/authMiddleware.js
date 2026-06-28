"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = authMiddleware;
const auth_1 = require("./auth");
// Routes that don't require authentication
const PUBLIC_PATHS = [
    '/',
    '/api/health',
    '/download-apk',
    '/api/exchange',
    '/api/conversations'
];
function isPublicPath(path) {
    return PUBLIC_PATHS.some(pub => path === pub || path === pub + '/' || path.startsWith(pub + '/api') || (pub !== '/' && path.startsWith(pub + '/')));
}
/**
 * Express middleware that enforces JWT authentication on all routes
 * except those listed in PUBLIC_PATHS.
 *
 * Expects: Authorization: Bearer <jwt>
 */
function authMiddleware(req, res, next) {
    // Allow public endpoints
    if (isPublicPath(req.path)) {
        next();
        return;
    }
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
    }
    else if (req.query.token) {
        token = req.query.token;
    }
    if (!token) {
        res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
        return;
    }
    const device = (0, auth_1.verifyToken)(token);
    if (!device) {
        res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
        return;
    }
    // Attach device info to request for downstream handlers
    req.device = device;
    next();
}
