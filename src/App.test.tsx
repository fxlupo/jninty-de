import "fake-indexeddb/auto";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { clearPouchDB } from "./db/pouchdb/testUtils.ts";

// Disable CloudGate so the test renders the actual app shell
vi.mock("./config/cloud", () => ({
  isCloudEnabled: false,
  apiUrl: undefined,
  stripePublishableKey: undefined,
  stripeMonthlyPriceId: undefined,
  stripeAnnualPriceId: undefined,
  monthlyPrice: "$4.99/mo",
  annualPrice: "$49.99/yr",
}));

// Mock session so RequireAuth doesn't redirect to /login
vi.mock("./store/sessionStore", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSession: () => ({
    user: { id: "test-user", email: "test@example.com", name: "Test User" },
    isLoading: false,
    refresh: async () => {},
    signOut: async () => {},
  }),
}));

import App from "./App.tsx";

beforeEach(async () => {
  await clearPouchDB();
});

describe("App", () => {
  it("renders the app shell with navigation", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getAllByText("Jninty").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(
        screen.getByText("Was passiert heute in deinem Garten?"),
      ).toBeInTheDocument();
    });
  });
});
