import { Router, type IRouter } from 'express';
import bcrypt from 'bcrypt';
import { db, usersTable } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '../middlewares/requireAuth';

const SALT_ROUNDS = 12;

function normalizeSingleId(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    if (value.length !== 1) {
      return null;
    }

    const [first] = value;
    const trimmed = typeof first === 'string' ? first.trim() : '';
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

const router: IRouter = Router();

// GET /api/users — list all users (admin only)
router.get('/', requireAdmin, async (_req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.createdAt);

  res.json({ users });
});

// POST /api/users — create a new user (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { username, password, role, email, firstName, lastName } = req.body ?? {};

  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  if (role && !['admin', 'user'].includes(role)) {
    res.status(400).json({ error: 'role must be "admin" or "user"' });
    return;
  }

  const passwordHash = await bcrypt.hash(password as string, SALT_ROUNDS);

  try {
    const [created] = await db
      .insert(usersTable)
      .values({
        username: username as string,
        passwordHash,
        email: (email as string) || null,
        firstName: (firstName as string) || null,
        lastName: (lastName as string) || null,
        role: (role as string) || 'user',
      })
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
      });

    res.status(201).json({ user: created });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      res.status(409).json({ error: 'Username already exists' });
    } else {
      throw err;
    }
  }
});

// PATCH /api/users/:id — update role or password (admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  const id = normalizeSingleId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  const { role, password, email, firstName, lastName } = req.body ?? {};

  if (role && !['admin', 'user'].includes(role)) {
    res.status(400).json({ error: 'role must be "admin" or "user"' });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (role) updates.role = role;
  if (email !== undefined) updates.email = email || null;
  if (firstName !== undefined) updates.firstName = firstName || null;
  if (lastName !== undefined) updates.lastName = lastName || null;
  if (password) updates.passwordHash = await bcrypt.hash(password as string, SALT_ROUNDS);

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning({
      id: usersTable.id,
      username: usersTable.username,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    });

  if (!updated) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ user: updated });
});

// DELETE /api/users/:id — delete user (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  const id = normalizeSingleId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }

  // Prevent deleting yourself
  const currentUserId = req.user?.id != null ? String(req.user.id) : null;
  if (currentUserId && id === currentUserId) {
    res.status(400).json({ error: 'You cannot delete your own account' });
    return;
  }

  const [deleted] = await db
    .delete(usersTable)
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id });

  if (!deleted) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ success: true });
});

export default router;
