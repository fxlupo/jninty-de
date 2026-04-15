import type { Context, Next } from "hono";
import { auth } from "../auth.ts";
import type { AppVariables } from "../types.ts";

/**
 * Hono middleware that validates the session cookie / Bearer token.
 * Sets `c.var.session` and `c.var.userId` for downstream handlers.
 * Returns 401 if no valid session is present.
 */
export async function requireAuth(
  c: Context<{ Variables: AppVariables }>,
  next: Next,
): Promise<Response | void> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    return c.json({ error: "Nicht angemeldet." }, 401);
  }

  c.set("session", session);
  c.set("userId", session.user.id);
  await next();
}
