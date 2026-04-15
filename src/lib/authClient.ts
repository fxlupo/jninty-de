import { createAuthClient } from "better-auth/client";

/**
 * Better-Auth client — connects to the Hono server via Vite's /api proxy.
 * In dev: requests go to localhost:5173/api/auth/* → proxied to localhost:3001/api/auth/*
 * In production: same origin (app and server served from the same host)
 */
export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "http://localhost:5173",
});
