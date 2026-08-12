import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './auth';

// Routes that don't require authentication
const PUBLIC_PATHS = [
    '/',
    '/admin',
    '/api/health',
    '/download-apk',
    '/api/exchange',
    '/api/conversations',
    '/api/invite/request',
    '/api/invite/status'
];

function isPublicPath(path: string): boolean {
    return PUBLIC_PATHS.some(pub => path === pub || path === pub + '/' || path.startsWith(pub + '/api') || (pub !== '/' && path.startsWith(pub + '/')));
}

/**
 * Express middleware that enforces JWT authentication on all routes
 * except those listed in PUBLIC_PATHS.
 * 
 * Expects: Authorization: Bearer <jwt>
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Allow local requests from localhost without token
    const ip = req.ip || req.socket.remoteAddress || '';
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.endsWith('127.0.0.1');
    if (isLocal) {
        (req as any).device = { deviceId: 'local-admin', deviceName: 'Local Admin', allowed_project_id: null };
        next();
        return;
    }

    // Allow public endpoints
    if (isPublicPath(req.path)) {
        next();
        return;
    }

    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
    } else if (req.query.token) {
        token = req.query.token as string;
    }

    if (!token) {
        res.status(401).json({ error: 'Authentication required', code: 'NO_TOKEN' });
        return;
    }

    const device = verifyToken(token);

    if (!device) {
        res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
        return;
    }

    // Attach device info to request for downstream handlers
    (req as any).device = device;
    next();
}
