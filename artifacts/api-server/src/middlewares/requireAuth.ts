import { type NextFunction, type Request, type Response } from 'express';

type AuthenticatedRequest = Request & {
  user?: {
    id: number;
    username: string;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    profileImageUrl: string | null;
    role: string;
  };
  isAuthenticated: () => boolean;
};

/** Requires any authenticated user. Returns 401 if not logged in. */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

/** Requires an admin user. Returns 401 if not logged in, 403 if not admin. */
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
