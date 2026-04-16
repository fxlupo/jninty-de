import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/client.ts";
import * as schema from "./db/schema.ts";

const secret = process.env["BETTER_AUTH_SECRET"];
if (!secret) {
  throw new Error(
    "BETTER_AUTH_SECRET is not set. Add it to your .env file.\n" +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
}

// When running behind a reverse proxy (Traefik → nginx → server), the
// incoming request is HTTP even though the public URL is HTTPS.
// Force secure cookies so the browser accepts them on the HTTPS domain.
const isProduction = (process.env["BETTER_AUTH_URL"] ?? "").startsWith("https://");

export const auth = betterAuth({
  secret,
  baseURL: process.env["BETTER_AUTH_URL"],
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Disable public sign-up — only admins can create users via the API
    autoSignIn: true,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 minutes client-side cache
    },
  },
  advanced: {
    useSecureCookies: isProduction,
  },
  trustedOrigins: (process.env["TRUSTED_ORIGINS"] ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim()),
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
