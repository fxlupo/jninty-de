import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/client.ts";
import { users } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import { auth } from "../auth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

/**
 * GET /api/users/me
 * Returns the currently authenticated user's profile.
 */
router.get("/me", requireAuth, (c) => {
  const session = c.get("session");
  return c.json({ user: session?.user });
});

/**
 * GET /api/users
 * Returns all users (any authenticated user can list — no role system yet).
 */
router.get("/", requireAuth, async (c) => {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users);
  return c.json({ users: rows });
});

/**
 * POST /api/users
 * Creates a new user. Only accessible when authenticated.
 * Body: { name: string, email: string, password: string }
 */
router.post("/", requireAuth, async (c) => {
  const body = await c.req.json<{
    name?: string;
    email?: string;
    password?: string;
  }>();

  if (!body.email || !body.password || !body.name) {
    return c.json(
      { error: "name, email und password sind erforderlich." },
      400,
    );
  }

  try {
    const result = await auth.api.signUpEmail({
      body: {
        name: body.name,
        email: body.email,
        password: body.password,
      },
    });
    return c.json({ user: result.user }, 201);
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Benutzer konnte nicht erstellt werden.";
    return c.json({ error: message }, 400);
  }
});

/**
 * DELETE /api/users/:id
 * Deletes a user. An authenticated user cannot delete themselves.
 */
router.delete("/:id", requireAuth, async (c) => {
  const id = c.req.param("id") ?? "";
  const userId = c.get("userId");

  if (id === userId) {
    return c.json(
      { error: "Du kannst deinen eigenen Account nicht löschen." },
      400,
    );
  }

  await db.delete(users).where(eq(users.id, id));
  return c.json({ ok: true });
});

export default router;
