import bcrypt from "bcrypt";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";

/**
 * Ensures the default admin account exists.
 * Safe to run on every startup — does nothing if the user is already present.
 */
export async function seedAdmin() {
  try {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, "admin"));

    if (existing) return;

    const passwordHash = await bcrypt.hash("admin@1z2*", 12);
    await db.insert(usersTable).values({
      username: "admin",
      passwordHash,
      role: "admin",
    });

    logger.info("Default admin account created (username: admin)");
  } catch (err) {
    logger.error({ err }, "Failed to seed admin account");
  }
}
