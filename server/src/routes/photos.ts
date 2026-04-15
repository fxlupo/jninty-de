import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { db } from "../db/client.ts";
import { photos } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

// Uploads directory: <repo-root>/data/uploads/
const UPLOADS_DIR = resolve(process.cwd(), "data", "uploads");

function now(): string {
  return new Date().toISOString();
}

function photoDir(id: string): string {
  return join(UPLOADS_DIR, id);
}

// ─── Upload ───────────────────────────────────────────────────────────────────

router.post("/upload", requireAuth, async (c) => {
  const userId = c.get("userId");

  const body = await c.req.parseBody();

  const thumbnailFile = body["thumbnail"];
  const displayFile = body["display"];
  const originalFile = body["original"];

  if (!thumbnailFile || !(thumbnailFile instanceof File)) {
    return c.json({ error: "thumbnail file required" }, 400);
  }

  const widthRaw = body["width"];
  const heightRaw = body["height"];
  const takenAt = typeof body["takenAt"] === "string" ? body["takenAt"] : undefined;

  const width = typeof widthRaw === "string" && widthRaw !== "" ? parseInt(widthRaw, 10) : undefined;
  const height = typeof heightRaw === "string" && heightRaw !== "" ? parseInt(heightRaw, 10) : undefined;

  const id = crypto.randomUUID();
  const dir = photoDir(id);
  await mkdir(dir, { recursive: true });

  // Save thumbnail
  await writeFile(join(dir, "thumbnail.jpg"), Buffer.from(await thumbnailFile.arrayBuffer()));
  const thumbnailUrl = `/uploads/${id}/thumbnail.jpg`;

  // Save display (optional)
  let displayUrl: string | undefined;
  if (displayFile instanceof File) {
    await writeFile(join(dir, "display.jpg"), Buffer.from(await displayFile.arrayBuffer()));
    displayUrl = `/uploads/${id}/display.jpg`;
  }

  // Save original (optional, kept server-side only)
  let originalStored = false;
  if (originalFile instanceof File) {
    await writeFile(join(dir, "original.jpg"), Buffer.from(await originalFile.arrayBuffer()));
    originalStored = true;
  }

  const timestamp = now();

  const [row] = await db
    .insert(photos)
    .values({
      id,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      userId,
      thumbnailUrl,
      ...(displayUrl != null ? { displayUrl } : {}),
      originalStored,
      ...(takenAt != null ? { takenAt } : {}),
      ...(width != null && !Number.isNaN(width) ? { width } : {}),
      ...(height != null && !Number.isNaN(height) ? { height } : {}),
    })
    .returning();

  if (!row) return c.json({ error: "Insert failed" }, 500);

  return c.json(toResponse(row), 201);
});

// ─── Get by ID ────────────────────────────────────────────────────────────────

router.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";

  const [row] = await db
    .select()
    .from(photos)
    .where(eq(photos.id, id))
    .limit(1);

  if (!row || row.userId !== userId || row.deletedAt != null) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(toResponse(row));
});

// ─── Update metadata ──────────────────────────────────────────────────────────

router.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<{ takenAt?: string; caption?: string }>();

  const [existing] = await db
    .select()
    .from(photos)
    .where(eq(photos.id, id))
    .limit(1);

  if (!existing || existing.userId !== userId || existing.deletedAt != null) {
    return c.json({ error: "Not found" }, 404);
  }

  const updates: Partial<typeof existing> = {
    updatedAt: now(),
    version: existing.version + 1,
  };
  if ("takenAt" in body) updates.takenAt = body.takenAt ?? null;
  if ("caption" in body) updates.caption = body.caption ?? null;

  const [updated] = await db
    .update(photos)
    .set(updates)
    .where(eq(photos.id, id))
    .returning();

  if (!updated) return c.json({ error: "Update failed" }, 500);

  return c.json(toResponse(updated));
});

// ─── Delete ───────────────────────────────────────────────────────────────────

router.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";

  const [existing] = await db
    .select()
    .from(photos)
    .where(eq(photos.id, id))
    .limit(1);

  if (!existing || existing.userId !== userId || existing.deletedAt != null) {
    return c.json({ error: "Not found" }, 404);
  }

  await db.delete(photos).where(eq(photos.id, id));

  // Remove uploaded files
  const dir = photoDir(id);
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true });
  }

  return c.body(null, 204);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toResponse(row: typeof photos.$inferSelect) {
  return {
    id: row.id,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    thumbnailUrl: row.thumbnailUrl,
    ...(row.displayUrl != null ? { displayUrl: row.displayUrl } : {}),
    originalStored: row.originalStored,
    ...(row.caption != null ? { caption: row.caption } : {}),
    ...(row.takenAt != null ? { takenAt: row.takenAt } : {}),
    ...(row.width != null ? { width: row.width } : {}),
    ...(row.height != null ? { height: row.height } : {}),
  };
}

export default router;
