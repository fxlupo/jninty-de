import { describe, it, expect } from "vitest";
import { photoSchema } from "./photo.schema.ts";
import { validateEntity } from "./helpers.ts";

const validPhoto = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  version: 1,
  createdAt: "2026-03-15T14:30:00Z",
  updatedAt: "2026-03-15T14:30:00Z",
  thumbnailUrl: "/uploads/abc/thumbnail.jpg",
  originalStored: false,
};

describe("photoSchema", () => {
  it("accepts valid minimal photo", () => {
    const result = validateEntity(photoSchema, validPhoto);
    expect(result.success).toBe(true);
  });

  it("accepts photo with all optional fields", () => {
    const full = {
      ...validPhoto,
      displayUrl: "/uploads/abc/display.jpg",
      originalStored: true,
      caption: "My tomato seedling",
      takenAt: "2026-03-15T10:00:00.000Z",
      width: 320,
      height: 240,
    };
    const result = validateEntity(photoSchema, full);
    expect(result.success).toBe(true);
  });

  it("accepts photo without displayUrl (optional)", () => {
    const result = validateEntity(photoSchema, validPhoto);
    expect(result.success).toBe(true);
  });

  it("rejects missing thumbnailUrl", () => {
    const { thumbnailUrl: _, ...noThumb } = validPhoto;
    void _;
    const result = validateEntity(photoSchema, noThumb);
    expect(result.success).toBe(false);
  });

  it("rejects empty thumbnailUrl", () => {
    const result = validateEntity(photoSchema, {
      ...validPhoto,
      thumbnailUrl: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean originalStored", () => {
    const result = validateEntity(photoSchema, {
      ...validPhoto,
      originalStored: "no",
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative width", () => {
    const result = validateEntity(photoSchema, {
      ...validPhoto,
      width: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero height", () => {
    const result = validateEntity(photoSchema, {
      ...validPhoto,
      height: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects fractional width", () => {
    const result = validateEntity(photoSchema, {
      ...validPhoto,
      width: 320.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty caption", () => {
    const result = validateEntity(photoSchema, {
      ...validPhoto,
      caption: "",
    });
    expect(result.success).toBe(false);
  });
});
