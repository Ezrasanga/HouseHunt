import { authenticate, requireAuth as baseRequireAuth } from './authenticate.js';
import { authorize as authorizeRole } from './authorize.js';

export const requireAuth = baseRequireAuth;
export const authenticateMiddleware = authenticate;
export const authorize = authorizeRole;
