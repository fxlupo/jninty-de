import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/cloud", () => ({
  apiUrl: "https://api.example.test/api",
}));

describe("VersionInfo", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ version: "1.3.2", commit: "abc1234" }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads the server version from the configured API base", async () => {
    const { default: VersionInfo } = await import("../components/VersionInfo");

    render(<VersionInfo />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("https://api.example.test/api/version");
    });
  });
});
