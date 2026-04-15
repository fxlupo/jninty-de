import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

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
  const body = bodyText
    ? (JSON.parse(bodyText as string) as Record<string, unknown>)
    : {};

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

    for (const [key, value] of params.entries()) {
      if (key === "start") {
        results = results.filter(
          (r) => typeof r[dateField] === "string" && (r[dateField] as string) >= value,
        );
      } else if (key === "end") {
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
    return _jsonResponse(items, 201);
  }

  // POST /api/{collection} — create one
  if (method === "POST" && !id) {
    const item = _createItem(body);
    coll.push(item);
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
    return _jsonResponse({ ok: true });
  }

  // PUT /api/{collection}/{id} — full replace (task-rules upsert, etc.)
  if (method === "PUT" && id) {
    const idx = coll.findIndex((r) => r["id"] === id);
    if (idx === -1) {
      const item = _createItem({ ...body, id });
      coll.push(item);
      return _jsonResponse(item, 201);
    }
    coll[idx] = { ...coll[idx]!, ...body, updatedAt: _now() };
    return _jsonResponse(coll[idx]);
  }

  // Fallback
  return _jsonResponse({ error: `Unhandled: ${method} ${rawUrl}` }, 500);
});

// Clear mock DB before each test to ensure isolation
beforeEach(() => {
  _mockDB.clear();
  _mockSettings = null;
});
