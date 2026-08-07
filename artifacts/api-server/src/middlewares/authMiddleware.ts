import { type NextFunction, type Request, type Response } from 'express';
import { getSession, getSessionId } from '../lib/auth';

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

export async function authMiddleware(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const sid = getSessionId(req);
  if (sid) {
    const session = await getSession(sid);
    if (session?.user) {
      req.user = session.user;
    }
  }
  req.isAuthenticated = () => !!req.user;
  next();
}
