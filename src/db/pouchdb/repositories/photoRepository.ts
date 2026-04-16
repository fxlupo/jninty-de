/**
 * Photo repository — server-backed via fetch API.
 * Photos are stored as files on the server filesystem; metadata in SQLite.
 * URLs point to /uploads/{photoId}/thumbnail.jpg etc. served as static files.
 */
import type { Photo } from "../../../validation/photo.schema.ts";

const BASE = "/api/photos";

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export type CreatePhotoWithFilesInput = {
  thumbnailBlob: Blob;
  displayBlob: Blob;
  originalFile?: Blob;
  width: number;
  height: number;
  takenAt?: string;
};

export type PhotoMeta = {
  id: string;
  takenAt?: string;
  createdAt: string;
};

/**
 * Upload thumbnail + display (+ optional original) and create the photo record.
 * Accepts an optional onProgress callback that receives 0–100 percent values.
 */
export function createWithFiles(
  input: CreatePhotoWithFilesInput,
  onProgress?: (percent: number) => void,
): Promise<Photo> {
  const form = new FormData();
  form.append("thumbnail", input.thumbnailBlob, "thumbnail.jpg");
  form.append("display", input.displayBlob, "display.jpg");
  if (input.originalFile) {
    form.append("original", input.originalFile, "original.jpg");
  }
  if (input.width > 0) form.append("width", String(input.width));
  if (input.height > 0) form.append("height", String(input.height));
  if (input.takenAt != null) form.append("takenAt", input.takenAt);

  return new Promise<Photo>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.withCredentials = true;

    if (onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Photo);
        } catch {
          reject(new Error("Ungültige Serverantwort"));
        }
      } else {
        try {
          const body = JSON.parse(xhr.responseText) as { error?: string };
          reject(new Error(body.error ?? `${xhr.status} ${xhr.statusText}`));
        } catch {
          reject(new Error(`${xhr.status} ${xhr.statusText}`));
        }
      }
    });

    xhr.addEventListener("error", () => {
      reject(new Error("Netzwerkfehler beim Upload. Bitte Verbindung prüfen."));
    });

    xhr.addEventListener("abort", () => {
      reject(new Error("Upload abgebrochen."));
    });

    xhr.open("POST", `${BASE}/upload`);
    xhr.send(form);
  });
}

export async function getById(id: string): Promise<Photo | undefined> {
  const res = await fetch(`${BASE}/${id}`, { credentials: "include" });
  if (res.status === 404) return undefined;
  if (!res.ok) return undefined;
  return res.json() as Promise<Photo>;
}

export async function getByIds(ids: string[]): Promise<Photo[]> {
  const results: Photo[] = [];
  for (const id of ids) {
    const photo = await getById(id);
    if (photo) results.push(photo);
  }
  return results;
}

/**
 * Returns the URL for the display-size image (falls back to thumbnail if no display).
 */
export async function getDisplayUrl(
  photoId: string,
): Promise<string | undefined> {
  const photo = await getById(photoId);
  if (!photo) return undefined;
  return photo.displayUrl ?? photo.thumbnailUrl;
}

/**
 * Fetch lightweight metadata for multiple photos (no image data loaded).
 */
export async function getPhotosMeta(ids: string[]): Promise<PhotoMeta[]> {
  const photos = await getByIds(ids);
  return photos.map((p) => ({
    id: p.id,
    createdAt: p.createdAt,
    ...(p.takenAt != null ? { takenAt: p.takenAt } : {}),
  }));
}

/**
 * Update photo metadata fields (takenAt, caption) without touching image files.
 */
export async function updateMeta(
  id: string,
  meta: { takenAt?: string; caption?: string },
): Promise<void> {
  await apiRequest<Photo>(`${BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(meta),
  });
}

export async function remove(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? `Photo not found: ${id}`);
  }
}

/**
 * Remove photo record and all associated image files from the server.
 * Also covers "original" file if it was stored.
 */
export async function removeWithFiles(id: string): Promise<void> {
  await remove(id);
}
