import { type NextFunction, type Request, type Response } from 'express';
import { getSession, getSessionId } from '../lib/auth';
import type { AuthUser } from '../../../../lib/api-zod/src/generated/types/authUser';

type AuthUserShape = AuthUser;

type AuthenticatedRequest = Omit<Request, 'user'> & {
  user?: AuthUserShape;
  isAuthenticated: () => boolean;
};

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const authenticatedReq = req as AuthenticatedRequest;

  const sid = getSessionId(req);
  if (sid) {
    const session = await getSession(sid);
    if (session?.user) {
      authenticatedReq.user = session.user;
    }
  }
  authenticatedReq.isAuthenticated = () => !!authenticatedReq.user;
  next();
}
