import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import * as pouchClient from "../src/db/pouchdb/client.ts";

// Mock matchMedia for jsdom (used by useTheme and InstallPrompt)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

afterEach(() => {
  cleanup();
});

// ─── In-memory API mock ────────────────────────────────────────────────────
// All /api/* fetch calls are intercepted and handled by an in-memory store.
// This avoids needing a running server in tests while keeping repository
// behaviour realistic (real JSON round-trips, same status codes).

const _mockDB = new Map<string, Record<string, unknown>[]>();
let _mockSettings: Record<string, unknown> | null = null;
let _triggerCounter = 0;

/**
 * Dispatch a synthetic "data-changed" event so usePouchQuery hooks
 * re-run their queries after an API mutation.
 */
async function _triggerReactivity(): Promise<void> {
  ++_triggerCounter;
  window.dispatchEvent(new CustomEvent("data-changed"));
  // Yield to allow React state updates to flush
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function _now(): string {
  return new Date().toISOString();
}

function _createItem(body: Record<string, unknown>): Record<string, unknown> {
  return {
    id: crypto.randomUUID(),
    version: 1,
    createdAt: _now(),
    updatedAt: _now(),
    // No deletedAt — absent until soft-deleted (undefined, not null)
    ...body,
  };
}

function _jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const _realFetch = globalThis.fetch;

globalThis.fetch = vi.fn(async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url;

  // Serve /uploads/* as tiny stub JPEG responses (for tests, no real filesystem)
  if (rawUrl.startsWith("/uploads/")) {
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    });
  }

  // Pass through non-API requests unchanged
  if (!rawUrl.startsWith("/api/")) {
    return _realFetch(input, init);
  }

  const method = (
    init?.method ??
    (input instanceof Request ? input.method : "GET")
  ).toUpperCase();

  // Parse path — always resolve against a base so URL() works
  const urlObj = new URL(rawUrl, "http://localhost:5173");
  const pathSegments = urlObj.pathname.replace(/^\/api\//, "").split("/");
  const collection = pathSegments[0] ?? "";
  const id = pathSegments[1];          // e.g. "abc-123" or "batch" or "bulk"
  const subAction = pathSegments[2];   // e.g. "complete", "uncomplete", "activate"

  const bodyText = init?.body;
  const isFormData = bodyText instanceof FormData;
  const body = (bodyText && !isFormData)
    ? (JSON.parse(bodyText as string) as Record<string, unknown>)
    : {};

  // ── Photos collection ────────────────────────────────────────────────────
  // Photos use FormData for upload, hard-delete (not soft), and URL-based fields.
  if (collection === "photos") {
    if (!_mockDB.has("photos")) _mockDB.set("photos", []);
    const photoColl = _mockDB.get("photos")!;

    // POST /api/photos/upload — multipart FormData
    if (method === "POST" && id === "upload") {
      const formData = init?.body as FormData | undefined;
      const hasThumbnail = formData instanceof FormData && formData.has("thumbnail");
      if (!hasThumbnail) return _jsonResponse({ error: "thumbnail file required" }, 400);

      const photoId = crypto.randomUUID();
      const takenAt = formData instanceof FormData ? (formData.get("takenAt") as string | null) : null;
      const widthStr = formData instanceof FormData ? (formData.get("width") as string | null) : null;
      const heightStr = formData instanceof FormData ? (formData.get("height") as string | null) : null;
      const hasDisplay = formData instanceof FormData && formData.has("display");
      const hasOriginal = formData instanceof FormData && formData.has("original");

      const width = widthStr ? parseInt(widthStr, 10) : undefined;
      const height = heightStr ? parseInt(heightStr, 10) : undefined;

      const record: Record<string, unknown> = {
        id: photoId,
        version: 1,
        createdAt: _now(),
        updatedAt: _now(),
        thumbnailUrl: `/uploads/${photoId}/thumbnail.jpg`,
        originalStored: hasOriginal,
        ...(hasDisplay ? { displayUrl: `/uploads/${photoId}/display.jpg` } : {}),
        ...(takenAt ? { takenAt } : {}),
        ...(width != null && !Number.isNaN(width) ? { width } : {}),
        ...(height != null && !Number.isNaN(height) ? { height } : {}),
      };
      photoColl.push(record);
      return _jsonResponse(record, 201);
    }

    // GET /api/photos/:id
    if (method === "GET" && id) {
      const item = photoColl.find((r) => r["id"] === id && !r["deletedAt"]);
      if (!item) return _jsonResponse({ error: "Not found" }, 404);
      return _jsonResponse(item);
    }

    // PATCH /api/photos/:id — update metadata
    if (method === "PATCH" && id && !subAction) {
      const patchBody = bodyText
        ? (JSON.parse(bodyText as string) as Record<string, unknown>)
        : {};
      const idx = photoColl.findIndex((r) => r["id"] === id && !r["deletedAt"]);
      if (idx === -1) return _jsonResponse({ error: "Not found" }, 404);
      const prev = photoColl[idx]!;
      photoColl[idx] = {
        ...prev,
        ...patchBody,
        version: ((prev["version"] as number) || 0) + 1,
        updatedAt: _now(),
      };
      return _jsonResponse(photoColl[idx]);
    }

    // DELETE /api/photos/:id — hard delete, return 204
    if (method === "DELETE" && id) {
      const idx = photoColl.findIndex((r) => r["id"] === id && !r["deletedAt"]);
      if (idx === -1) return _jsonResponse({ error: "Not found" }, 404);
      photoColl.splice(idx, 1);
      return new Response(null, { status: 204 });
    }

    return _jsonResponse({ error: `Unhandled photos: ${method} ${rawUrl}` }, 500);
  }

  // ── Settings singleton ──────────────────────────────────────────────────
  if (collection === "settings") {
    if (method === "GET") {
      if (!_mockSettings) return _jsonResponse({ error: "Not found" }, 404);
      return _jsonResponse(_mockSettings);
    }
    if (method === "PUT" || method === "PATCH") {
      _mockSettings = { ..._mockSettings, ...body, updatedAt: _now() };
      return _jsonResponse(_mockSettings);
    }
    return _jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ── Normal collections ──────────────────────────────────────────────────
  if (!_mockDB.has(collection)) _mockDB.set(collection, []);
  const coll = _mockDB.get(collection)!;

  // GET /api/{collection}
  if (method === "GET" && !id) {
    // Query param → data field name mappings (mirrors server-side route logic)
    const PARAM_FIELD: Record<string, string> = {
      plantId: "plantInstanceId",    // journal, tasks
      scheduleId: "plantingScheduleId", // schedule-tasks
    };
    // Date field to use for start/end filtering per collection
    const DATE_FIELD: Record<string, string> = {
      "schedule-tasks": "scheduledDate",
      tasks: "dueDate",
      journal: "createdAt",
    };
    const dateField = DATE_FIELD[collection] ?? "createdAt";

    let results = coll.filter((r) => !r["deletedAt"]);
    const params = urlObj.searchParams;
    let limitVal: number | undefined;

    let hasDateRange = false;
    for (const [key, value] of params.entries()) {
      if (key === "start") {
        hasDateRange = true;
        results = results.filter(
          (r) => typeof r[dateField] === "string" && (r[dateField] as string) >= value,
        );
      } else if (key === "end") {
        hasDateRange = true;
        results = results.filter(
          (r) => typeof r[dateField] === "string" && (r[dateField] as string) <= value,
        );
      } else if (key === "limit") {
        limitVal = parseInt(value, 10);
      } else if (key === "overdue") {
        const today = new Date().toISOString().slice(0, 10);
        results = results.filter(
          (r) => typeof r[dateField] === "string" && (r[dateField] as string) < today && !r["isCompleted"],
        );
      } else {
        // Named or generic equality filter
        const fieldName = PARAM_FIELD[key] ?? key;
        results = results.filter((r) => r[fieldName] === value);
      }
    }

    // Default sort: by sequenceOrder (schedule-tasks), by year desc (seasons), by createdAt desc (others)
    if (collection === "schedule-tasks") {
      results.sort((a, b) => ((a["sequenceOrder"] as number) || 0) - ((b["sequenceOrder"] as number) || 0));
    } else if (collection === "seasons") {
      results.sort((a, b) => ((b["year"] as number) || 0) - ((a["year"] as number) || 0));
    } else {
      results.sort((a, b) => {
        const aTime = (a["createdAt"] as string) ?? "";
        const bTime = (b["createdAt"] as string) ?? "";
        return bTime.localeCompare(aTime);
      });
    }

    // For date-range queries on tasks/schedule-tasks, exclude completed items
    // (mirrors server behaviour for getUpcoming / getByDateRange)
    if (hasDateRange && (collection === "tasks" || collection === "schedule-tasks")) {
      results = results.filter((r) => !r["isCompleted"]);
    }

    if (limitVal !== undefined) results = results.slice(0, limitVal);
    return _jsonResponse(results);
  }

  // GET /api/{collection}/{id}
  if (method === "GET" && id) {
    const item = coll.find((r) => r["id"] === id && !r["deletedAt"]);
    if (!item) return _jsonResponse({ error: "Not found" }, 404);
    return _jsonResponse(item);
  }

  // POST /api/{collection}/batch — create multiple
  if (method === "POST" && id === "batch") {
    const inputs = JSON.parse(bodyText as string) as Record<string, unknown>[];
    const items = inputs.map((b) => _createItem(b));
    coll.push(...items);
    await _triggerReactivity();
    return _jsonResponse(items, 201);
  }

  // POST /api/{collection} — create one
  if (method === "POST" && !id) {
    const item = _createItem(body);
    coll.push(item);
    await _triggerReactivity();
    return _jsonResponse(item, 201);
  }

  // PATCH /api/{collection}/{id} — update
  if (method === "PATCH" && id && !subAction) {
    const idx = coll.findIndex((r) => r["id"] === id && !r["deletedAt"]);
    if (idx === -1) return _jsonResponse({ error: "Not found" }, 404);
    const prev = coll[idx]!;
    coll[idx] = {
      ...prev,
      ...body,
      version: ((prev["version"] as number) || 0) + 1,
      updatedAt: _now(),
    };
    await _triggerReactivity();
    return _jsonResponse(coll[idx]);
  }

  // POST or PATCH /api/{collection}/{id}/complete
  if ((method === "POST" || method === "PATCH") && id && subAction === "complete") {
    const idx = coll.findIndex((r) => r["id"] === id && !r["deletedAt"]);
    if (idx === -1) return _jsonResponse({ error: "Not found" }, 404);
    const prev = coll[idx]!;
    coll[idx] = {
      ...prev,
      isCompleted: true,
      completedDate: (body["completedDate"] as string | undefined) ?? _now().slice(0, 10),
      completedAt: _now(),
      updatedAt: _now(),
      version: ((prev["version"] as number) || 0) + 1,
    };
    await _triggerReactivity();
    return _jsonResponse(coll[idx]);
  }

  // POST or PATCH /api/{collection}/{id}/uncomplete
  if ((method === "POST" || method === "PATCH") && id && subAction === "uncomplete") {
    const idx = coll.findIndex((r) => r["id"] === id && !r["deletedAt"]);
    if (idx === -1) return _jsonResponse({ error: "Not found" }, 404);
    const uncompleted = { ...coll[idx]!, isCompleted: false, updatedAt: _now() };
    // Remove completion fields rather than setting to null
    delete uncompleted["completedDate"];
    delete uncompleted["completedAt"];
    coll[idx] = uncompleted;
    await _triggerReactivity();
    return _jsonResponse(coll[idx]);
  }

  // POST or PATCH /api/{collection}/{id}/activate (seasons)
  if ((method === "POST" || method === "PATCH") && id && subAction === "activate") {
    coll.forEach((r) => {
      r["isActive"] = false;
    });
    const idx = coll.findIndex((r) => r["id"] === id && !r["deletedAt"]);
    if (idx === -1) return _jsonResponse({ error: "Not found" }, 404);
    coll[idx] = { ...coll[idx]!, isActive: true, updatedAt: _now() };
    await _triggerReactivity();
    return _jsonResponse(coll[idx]);
  }

  // DELETE /api/{collection}/bulk?scheduleId= — bulk soft-delete
  if (method === "DELETE" && id === "bulk") {
    const scheduleId = urlObj.searchParams.get("scheduleId");
    const ts = _now();
    coll.forEach((r) => {
      if (r["plantingScheduleId"] === scheduleId) {
        r["deletedAt"] = ts;
        r["updatedAt"] = ts;
      }
    });
    await _triggerReactivity();
    return _jsonResponse({ ok: true });
  }

  // DELETE /api/{collection}/{id} — soft-delete one
  if (method === "DELETE" && id) {
    const idx = coll.findIndex((r) => r["id"] === id && !r["deletedAt"]);
    if (idx === -1) return _jsonResponse({ error: "Not found" }, 404);
    const ts = _now();
    const prev = coll[idx]!;
    coll[idx] = {
      ...prev,
      deletedAt: ts,
      updatedAt: ts,
      version: ((prev["version"] as number) || 0) + 1,
    };
    await _triggerReactivity();
    return _jsonResponse({ ok: true });
  }

  // PUT /api/{collection}/{id} — full replace (task-rules upsert, etc.)
  if (method === "PUT" && id) {
    const idx = coll.findIndex((r) => r["id"] === id);
    if (idx === -1) {
      const item = _createItem({ ...body, id });
      coll.push(item);
      await _triggerReactivity();
      return _jsonResponse(item, 201);
    }
    coll[idx] = { ...coll[idx]!, ...body, updatedAt: _now() };
    await _triggerReactivity();
    return _jsonResponse(coll[idx]);
  }

  // POST /api/reset — wipe all mock data
  if (method === "POST" && collection === "reset" && !id) {
    _mockDB.clear();
    _mockSettings = null;
    await _triggerReactivity();
    return _jsonResponse({ ok: true });
  }

  // Fallback
  return _jsonResponse({ error: `Unhandled: ${method} ${rawUrl}` }, 500);
});

// Clear mock DB before each test to ensure isolation
beforeEach(() => {
  _mockDB.clear();
  _mockSettings = null;
});
