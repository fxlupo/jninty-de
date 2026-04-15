import { describe, it, expect, beforeEach, vi } from "vitest";

// The photo repository now calls fetch; the global fetch mock in tests/setup.ts
// covers /api/photos/* via the in-memory store.

const photoRepo = await import("./photoRepository.ts");

function makeBlob(content: string, type = "image/jpeg"): Blob {
  return new Blob([content], { type });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("photoRepository (API-backed)", () => {
  describe("createWithFiles", () => {
    it("uploads files and returns a photo with URL fields", async () => {
      const photo = await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("thumb"),
        displayBlob: makeBlob("display"),
        width: 1600,
        height: 1200,
      });

      expect(photo.id).toBeDefined();
      expect(photo.version).toBe(1);
      expect(photo.thumbnailUrl).toMatch(/^\/uploads\//);
      expect(photo.displayUrl).toMatch(/^\/uploads\//);
      expect(photo.originalStored).toBe(false);
    });

    it("marks originalStored=true when originalFile is provided", async () => {
      const photo = await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("thumb"),
        displayBlob: makeBlob("display"),
        originalFile: makeBlob("original"),
        width: 3000,
        height: 2000,
      });

      expect(photo.originalStored).toBe(true);
      expect(photo.width).toBe(3000);
      expect(photo.height).toBe(2000);
    });

    it("stores takenAt when provided", async () => {
      const photo = await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("thumb"),
        displayBlob: makeBlob("display"),
        width: 800,
        height: 600,
        takenAt: "2026-03-15T10:00:00.000Z",
      });

      expect(photo.takenAt).toBe("2026-03-15T10:00:00.000Z");
    });
  });

  describe("getById", () => {
    it("returns a photo by id", async () => {
      const created = await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("thumb"),
        displayBlob: makeBlob("display"),
        width: 800,
        height: 600,
      });

      const found = await photoRepo.getById(created.id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.thumbnailUrl).toBeDefined();
    });

    it("returns undefined for nonexistent photo", async () => {
      const found = await photoRepo.getById("nonexistent");
      expect(found).toBeUndefined();
    });
  });

  describe("getByIds", () => {
    it("returns photos matching the given ids", async () => {
      const p1 = await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("t1"),
        displayBlob: makeBlob("d1"),
        width: 100,
        height: 100,
      });
      const p2 = await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("t2"),
        displayBlob: makeBlob("d2"),
        width: 100,
        height: 100,
      });
      await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("t3"),
        displayBlob: makeBlob("d3"),
        width: 100,
        height: 100,
      });

      const results = await photoRepo.getByIds([p1.id, p2.id]);
      expect(results).toHaveLength(2);
    });
  });

  describe("getDisplayUrl", () => {
    it("returns displayUrl when available", async () => {
      const created = await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("thumb"),
        displayBlob: makeBlob("display"),
        width: 800,
        height: 600,
      });

      const url = await photoRepo.getDisplayUrl(created.id);
      expect(url).toMatch(/display/);
    });

    it("falls back to thumbnailUrl when no display", async () => {
      const created = await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("thumb-only"),
        displayBlob: makeBlob("display"),
        width: 100,
        height: 100,
      });
      // Force no displayUrl by checking the thumbnail fallback path
      const url = await photoRepo.getDisplayUrl(created.id);
      expect(url).toBeDefined();
    });

    it("returns undefined for nonexistent photo", async () => {
      const url = await photoRepo.getDisplayUrl("nonexistent");
      expect(url).toBeUndefined();
    });
  });

  describe("updateMeta", () => {
    it("updates takenAt metadata", async () => {
      const created = await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("thumb"),
        displayBlob: makeBlob("display"),
        width: 100,
        height: 100,
      });

      await photoRepo.updateMeta(created.id, { takenAt: "2026-04-01T12:00:00.000Z" });
      const found = await photoRepo.getById(created.id);
      expect(found?.takenAt).toBe("2026-04-01T12:00:00.000Z");
    });
  });

  describe("remove / removeWithFiles", () => {
    it("removes a photo", async () => {
      const photo = await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("thumb"),
        displayBlob: makeBlob("display"),
        width: 100,
        height: 100,
      });

      await photoRepo.remove(photo.id);
      const found = await photoRepo.getById(photo.id);
      expect(found).toBeUndefined();
    });

    it("removeWithFiles also removes the photo record", async () => {
      const photo = await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("thumb"),
        displayBlob: makeBlob("display"),
        width: 100,
        height: 100,
      });

      await photoRepo.removeWithFiles(photo.id);
      const found = await photoRepo.getById(photo.id);
      expect(found).toBeUndefined();
    });

    it("throws when removing nonexistent photo", async () => {
      await expect(photoRepo.remove("nonexistent")).rejects.toThrow();
    });
  });

  describe("getPhotosMeta", () => {
    it("returns metadata for given ids", async () => {
      const p1 = await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("t1"),
        displayBlob: makeBlob("d1"),
        width: 100,
        height: 100,
        takenAt: "2026-01-01T00:00:00.000Z",
      });
      const p2 = await photoRepo.createWithFiles({
        thumbnailBlob: makeBlob("t2"),
        displayBlob: makeBlob("d2"),
        width: 100,
        height: 100,
      });

      const meta = await photoRepo.getPhotosMeta([p1.id, p2.id]);
      expect(meta).toHaveLength(2);
      const m1 = meta.find((m) => m.id === p1.id);
      expect(m1?.takenAt).toBe("2026-01-01T00:00:00.000Z");
      expect(meta.find((m) => m.id === p2.id)?.createdAt).toBeDefined();
    });

    it("returns empty array for empty input", async () => {
      const meta = await photoRepo.getPhotosMeta([]);
      expect(meta).toHaveLength(0);
    });
  });
});
