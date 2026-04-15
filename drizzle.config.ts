import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./server/src/db/schema.ts",
  out: "./server/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/jninty.db",
  },
});
