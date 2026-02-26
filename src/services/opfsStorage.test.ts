import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  isOpfsAvailable,
  _resetDetection,
  displayPath,
  originalPath,
  writeFile,
  readFile,
  deleteFile,
  getDirectorySize,
  clearDirectory,
} from "./opfsStorage.ts";

beforeEach(() => {
  _resetDetection();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isOpfsAvailable", () => {
  it("returns false in jsdom (no navigator.storage.getDirectory)", () => {
    expect(isOpfsAvailable()).toBe(false);
  });

  it("returns true when navigator.storage.getDirectory is a function", () => {
    vi.stubGlobal("navigator", {
      storage: { getDirectory: vi.fn() },
    });
    _resetDetection();
    expect(isOpfsAvailable()).toBe(true);
    vi.unstubAllGlobals();
  });

  it("caches the detection result", () => {
    const result1 = isOpfsAvailable();
    const result2 = isOpfsAvailable();
    expect(result1).toBe(result2);
  });
});

describe("path helpers", () => {
  it("displayPath returns correct path", () => {
    expect(displayPath("abc-123")).toBe("photos/display/abc-123.jpg");
  });

  it("originalPath returns correct path", () => {
    expect(originalPath("abc-123")).toBe("photos/originals/abc-123.jpg");
  });
});

describe("file operations (OPFS unavailable)", () => {
  it("writeFile is a no-op when OPFS unavailable", async () => {
    await expect(
      writeFile("test/file.jpg", new Blob(["data"])),
    ).resolves.toBeUndefined();
  });

  it("readFile returns undefined when OPFS unavailable", async () => {
    const result = await readFile("test/file.jpg");
    expect(result).toBeUndefined();
  });

  it("deleteFile is a no-op when OPFS unavailable", async () => {
    await expect(deleteFile("test/file.jpg")).resolves.toBeUndefined();
  });

  it("getDirectorySize returns 0 when OPFS unavailable", async () => {
    const size = await getDirectorySize("photos/display");
    expect(size).toBe(0);
  });

  it("clearDirectory is a no-op when OPFS unavailable", async () => {
    await expect(clearDirectory("photos/display")).resolves.toBeUndefined();
  });
});

describe("file operations (OPFS mocked)", () => {
  // Shared file storage backing the mock (keyed by full path)
  let fileStore: Map<string, Blob>;

  type MockFileHandle = {
    kind: "file";
    name: string;
    getFile: () => Promise<Blob>;
    createWritable: () => Promise<{
      write: (blob: Blob) => Promise<void>;
      close: () => Promise<void>;
    }>;
  };

  type MockDirHandle = {
    kind: "directory";
    getFileHandle: (
      name: string,
      opts?: { create?: boolean },
    ) => Promise<MockFileHandle>;
    getDirectoryHandle: (
      name: string,
      opts?: { create?: boolean },
    ) => Promise<MockDirHandle>;
    removeEntry: (name: string, opts?: { recursive?: boolean }) => Promise<void>;
    entries: () => AsyncIterable<[string, MockFileHandle | MockDirHandle]>;
  };

  // Track which directories/files exist by prefix
  function filesUnderDir(dirPath: string): string[] {
    const prefix = dirPath ? `${dirPath}/` : "";
    return Array.from(fileStore.keys()).filter((k) => k.startsWith(prefix));
  }

  function createMockFileHandle(
    fullPath: string,
    name: string,
  ): MockFileHandle {
    return {
      kind: "file",
      name,
      getFile: () =>
        Promise.resolve(fileStore.get(fullPath) ?? new Blob([])),
      createWritable: () =>
        Promise.resolve({
          write: (blob: Blob) => {
            fileStore.set(fullPath, blob);
            return Promise.resolve();
          },
          close: () => Promise.resolve(),
        }),
    };
  }

  function createMockDirHandle(dirPath: string): MockDirHandle {
    return {
      kind: "directory",
      getFileHandle: (name: string, opts?: { create?: boolean }) => {
        const fullPath = dirPath ? `${dirPath}/${name}` : name;
        if (fileStore.has(fullPath) || opts?.create) {
          return Promise.resolve(createMockFileHandle(fullPath, name));
        }
        return Promise.reject(new Error("Not found"));
      },
      getDirectoryHandle: (name: string, opts?: { create?: boolean }) => {
        const subPath = dirPath ? `${dirPath}/${name}` : name;
        // Directory exists if any files are under it, or if create requested
        const hasFiles = filesUnderDir(subPath).length > 0;
        if (hasFiles || opts?.create) {
          return Promise.resolve(createMockDirHandle(subPath));
        }
        return Promise.reject(new Error("Not found"));
      },
      removeEntry: (name: string) => {
        const fullPath = dirPath ? `${dirPath}/${name}` : name;
        // Remove file or all files under directory
        for (const key of Array.from(fileStore.keys())) {
          if (key === fullPath || key.startsWith(`${fullPath}/`)) {
            fileStore.delete(key);
          }
        }
        return Promise.resolve();
      },
      entries: () => {
        // Return immediate children (files and subdirectories)
        const prefix = dirPath ? `${dirPath}/` : "";
        const childNames = new Set<string>();
        for (const key of fileStore.keys()) {
          if (!key.startsWith(prefix)) continue;
          const rest = key.slice(prefix.length);
          const firstSlash = rest.indexOf("/");
          childNames.add(firstSlash === -1 ? rest : rest.slice(0, firstSlash));
        }
        const names = Array.from(childNames);
        let i = 0;
        return {
          [Symbol.asyncIterator]() {
            return {
              next: () => {
                if (i < names.length) {
                  const name = names[i]!;
                  i++;
                  const fullPath = prefix + name;
                  const isFile = fileStore.has(fullPath);
                  const handle = isFile
                    ? createMockFileHandle(fullPath, name)
                    : createMockDirHandle(fullPath);
                  return Promise.resolve({
                    value: [name, handle] as [string, MockFileHandle | MockDirHandle],
                    done: false as const,
                  });
                }
                return Promise.resolve({
                  value: undefined as unknown as [string, MockFileHandle | MockDirHandle],
                  done: true as const,
                });
              },
            };
          },
        };
      },
    };
  }

  beforeEach(() => {
    fileStore = new Map();
    const rootDir = createMockDirHandle("");

    vi.stubGlobal("navigator", {
      storage: {
        getDirectory: () => Promise.resolve(rootDir),
      },
    });
    _resetDetection();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    _resetDetection();
  });

  it("writeFile + readFile round-trip (flat path)", async () => {
    const data = new Blob(["hello"], { type: "text/plain" });
    await writeFile("test.txt", data);

    const result = await readFile("test.txt");
    expect(result).toBeDefined();
    expect(result!.size).toBe(5);
  });

  it("writeFile + readFile round-trip (nested path)", async () => {
    const data = new Blob(["photo-data"], { type: "image/jpeg" });
    await writeFile("photos/display/abc.jpg", data);

    const result = await readFile("photos/display/abc.jpg");
    expect(result).toBeDefined();
    expect(result!.size).toBe(10);
  });

  it("readFile returns undefined for non-existent file", async () => {
    const result = await readFile("does-not-exist.txt");
    expect(result).toBeUndefined();
  });

  it("deleteFile removes a file", async () => {
    await writeFile("photos/display/to-delete.jpg", new Blob(["data"]));
    await deleteFile("photos/display/to-delete.jpg");

    const result = await readFile("photos/display/to-delete.jpg");
    expect(result).toBeUndefined();
  });

  it("getDirectorySize sums file sizes", async () => {
    await writeFile("photos/display/a.jpg", new Blob(["aaa"]));
    await writeFile("photos/display/b.jpg", new Blob(["bbbbb"]));

    const size = await getDirectorySize("photos/display");
    expect(size).toBe(8); // 3 + 5
  });

  it("getDirectorySize returns 0 for non-existent directory", async () => {
    const size = await getDirectorySize("nonexistent/dir");
    expect(size).toBe(0);
  });

  it("clearDirectory removes all files", async () => {
    await writeFile("photos/originals/a.jpg", new Blob(["aaa"]));
    await writeFile("photos/originals/b.jpg", new Blob(["bbb"]));

    await clearDirectory("photos/originals");

    const sizeAfter = await getDirectorySize("photos/originals");
    expect(sizeAfter).toBe(0);
  });
});
