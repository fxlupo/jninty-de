import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { AppVariables } from "./types.ts";
import { auth } from "./auth.ts";
import { runMigrations } from "./db/client.ts";
import usersRouter from "./routes/users.ts";
import plantsRouter from "./routes/plants.ts";
import tasksRouter from "./routes/tasks.ts";
import seasonsRouter from "./routes/seasons.ts";
import expensesRouter from "./routes/expenses.ts";
import journalRouter from "./routes/journal.ts";
import seedsRouter from "./routes/seeds.ts";
import settingsRouter from "./routes/settings.ts";
import scheduleTasksRouter from "./routes/scheduleTasks.ts";
import gardenBedsRouter from "./routes/gardenBeds.ts";
import plantingsRouter from "./routes/plantings.ts";
import plantingSchedulesRouter from "./routes/plantingSchedules.ts";
import taskRulesRouter from "./routes/taskRules.ts";
import knowledgeRouter from "./routes/knowledge.ts";

const PORT = Number(process.env["PORT"] ?? 3001);
const FRONTEND_ORIGIN = process.env["FRONTEND_ORIGIN"] ?? "http://localhost:5173";

// ─── Run DB migrations before accepting requests ──────────────────────────────

runMigrations();
console.log("✓ Datenbankmigrationen ausgeführt");

// ─── Hono app ─────────────────────────────────────────────────────────────────

const app = new Hono<{ Variables: AppVariables }>();

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: FRONTEND_ORIGIN,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

// ─── Better-Auth handles all /api/auth/* routes ───────────────────────────────

app.on(["GET", "POST"], "/api/auth/**", (c) => auth.handler(c.req.raw));

// ─── App routes ───────────────────────────────────────────────────────────────

app.route("/api/users", usersRouter);
app.route("/api/plants", plantsRouter);
app.route("/api/tasks", tasksRouter);
app.route("/api/seasons", seasonsRouter);
app.route("/api/expenses", expensesRouter);
app.route("/api/journal", journalRouter);
app.route("/api/seeds", seedsRouter);
app.route("/api/settings", settingsRouter);
app.route("/api/schedule-tasks", scheduleTasksRouter);
app.route("/api/garden-beds", gardenBedsRouter);
app.route("/api/plantings", plantingsRouter);
app.route("/api/planting-schedules", plantingSchedulesRouter);
app.route("/api/task-rules", taskRulesRouter);
app.route("/api/knowledge", knowledgeRouter);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/api/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

// ─── Start server ─────────────────────────────────────────────────────────────

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`✓ Server läuft auf http://localhost:${info.port}`);
});
