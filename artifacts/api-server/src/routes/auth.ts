import { Router, type IRouter } from 'express';
import bcrypt from 'bcrypt';
import { db, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import {
  clearSession,
  createSession,
  getSessionId,
  setSessionCookie,
} from '../lib/auth';
import { requireAuth } from '../middlewares/requireAuth';

const router: IRouter = Router();

// GET /api/auth/user — return the current session user (or null)
router.get('/auth/user', (req, res) => {
  const user = req.user ?? null;
  res.json({ user });
});

// POST /api/login — local username + password login
router.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};

  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  const [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.username, username as string));

  if (!dbUser) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const valid = await bcrypt.compare(password as string, dbUser.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const sid = await createSession({
    user: {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email ?? null,
      firstName: dbUser.firstName ?? null,
      lastName: dbUser.lastName ?? null,
      profileImageUrl: dbUser.profileImageUrl ?? null,
      role: dbUser.role,
    },
  });

  setSessionCookie(res, sid);
  res.json({
    user: {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email ?? null,
      firstName: dbUser.firstName ?? null,
      lastName: dbUser.lastName ?? null,
      profileImageUrl: dbUser.profileImageUrl ?? null,
      role: dbUser.role,
    },
  });
});

// POST /api/logout — destroy the session
router.post('/logout', requireAuth, async (req, res) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ success: true });
});

export default router;
