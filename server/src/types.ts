import type { auth } from "./auth.ts";

/** Typed context variables set by requireAuth middleware. */
export type AppVariables = {
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
  userId: string;
};
