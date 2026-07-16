import { type NextFunction, type Request, type Response } from 'express';
import { getSession, getSessionId } from '../lib/auth';

export async function authMiddleware(
  req: Request,
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
