import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { photoRepository } from "../db/index.ts";
import PhotoThumbnail from "./PhotoThumbnail.tsx";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PhotoThumbnail", () => {
  it("shows loading skeleton initially", () => {
    render(<PhotoThumbnail photoId="nonexistent" className="h-16 w-16" />);
    const skeleton = screen.getByRole("status", { name: "Loading photo" });
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.className).toContain("animate-pulse");
  });

  it("shows placeholder when photo is not found", async () => {
    render(<PhotoThumbnail photoId="00000000-0000-0000-0000-000000000000" />);

    await waitFor(() => {
      expect(screen.getByLabelText("Photo not found")).toBeInTheDocument();
    });
  });

  it("renders an img with thumbnailUrl when photo exists", async () => {
    const photo = await photoRepository.createWithFiles({
      thumbnailBlob: new Blob([new Uint8Array(100)], { type: "image/jpeg" }),
      displayBlob: new Blob([new Uint8Array(200)], { type: "image/jpeg" }),
      width: 320,
      height: 240,
    });

    render(<PhotoThumbnail photoId={photo.id} alt="My tomato" className="h-20" />);

    await waitFor(() => {
      const img = screen.getByRole("img", { name: "My tomato" });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", photo.thumbnailUrl);
      expect(img.className).toContain("h-20");
    });
  });

  it("shows placeholder when getById fails", async () => {
    vi.spyOn(photoRepository, "getById").mockRejectedValue(new Error("fetch error"));

    render(<PhotoThumbnail photoId="any-id" />);

    await waitFor(() => {
      expect(screen.getByLabelText("Photo not found")).toBeInTheDocument();
    });
  });
});
