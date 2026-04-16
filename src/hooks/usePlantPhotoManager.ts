import { useState, useCallback, useEffect, useRef } from "react";
import { photoRepository } from "../db/index.ts";
import type { ProcessedPhoto } from "../services/photoProcessor";

// ─── Types ───

export type ExistingPhotoEntry = {
  kind: "existing";
  id: string;
  previewUrl: string;
  takenAt?: string;
  originalTakenAt?: string;
};

export type PendingPhotoEntry = {
  kind: "pending";
  localId: string;
  processed: ProcessedPhoto;
  previewUrl: string;
  takenAt: string;
};

export type PhotoEntry = ExistingPhotoEntry | PendingPhotoEntry;

export function entryId(entry: PhotoEntry): string {
  return entry.kind === "existing" ? entry.id : entry.localId;
}

// ─── Hook ───

export function usePlantPhotoManager() {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const allUrlsRef = useRef<Set<string>>(new Set());
  const removedExistingIdsRef = useRef<string[]>([]);

  // Revoke all Object URLs on unmount
  useEffect(() => {
    const urls = allUrlsRef.current;
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  /**
   * Replace the entire photo list with pre-loaded existing photos (edit mode).
   * Revokes any Object URLs that are being replaced.
   */
  const loadExisting = useCallback(
    (entries: Array<{ id: string; previewUrl: string; takenAt?: string }>) => {
      setPhotos((prev) => {
        // Revoke URLs for photos that are being replaced
        for (const p of prev) {
          URL.revokeObjectURL(p.previewUrl);
          allUrlsRef.current.delete(p.previewUrl);
        }
        for (const e of entries) {
          allUrlsRef.current.add(e.previewUrl);
        }
        return entries.map((e) => ({
          kind: "existing" as const,
          id: e.id,
          previewUrl: e.previewUrl,
          ...(e.takenAt != null
            ? { takenAt: e.takenAt, originalTakenAt: e.takenAt }
            : {}),
        }));
      });
    },
    [],
  );

  /** Register an already-saved photo (edit mode). */
  const addExisting = useCallback(
    (id: string, previewUrl: string, takenAt?: string) => {
      allUrlsRef.current.add(previewUrl);
      setPhotos((prev) => [
        ...prev,
        {
          kind: "existing" as const,
          id,
          previewUrl,
          ...(takenAt != null ? { takenAt, originalTakenAt: takenAt } : {}),
        },
      ]);
    },
    [],
  );

  /** Add a newly captured/selected photo (not yet saved to DB). */
  const addNew = useCallback((processed: ProcessedPhoto) => {
    const previewUrl = URL.createObjectURL(processed.thumbnailBlob);
    allUrlsRef.current.add(previewUrl);
    // Use EXIF DateTimeOriginal if available, otherwise fall back to now
    const takenAt = processed.takenAt ?? new Date().toISOString();
    const localId = crypto.randomUUID();
    setPhotos((prev) => [
      ...prev,
      { kind: "pending" as const, localId, processed, previewUrl, takenAt },
    ]);
  }, []);

  /** Remove a photo by its entry ID. Revokes its Object URL. */
  const remove = useCallback((eId: string) => {
    setPhotos((prev) => {
      const entry = prev.find((p) => entryId(p) === eId);
      if (entry) {
        URL.revokeObjectURL(entry.previewUrl);
        allUrlsRef.current.delete(entry.previewUrl);
        if (entry.kind === "existing") {
          removedExistingIdsRef.current.push(entry.id);
        }
      }
      return prev.filter((p) => entryId(p) !== eId);
    });
  }, []);

  /** Move the photo with the given ID to index 0 (makes it the cover). */
  const setCover = useCallback((eId: string) => {
    setPhotos((prev) => {
      const index = prev.findIndex((p) => entryId(p) === eId);
      if (index <= 0) return prev;
      const copy = [...prev];
      const item = copy.splice(index, 1)[0];
      if (!item) return prev;
      return [item, ...copy];
    });
  }, []);

  /** Update the takenAt date for a photo entry. */
  const updateTakenAt = useCallback((eId: string, takenAt: string) => {
    setPhotos((prev) =>
      prev.map((p) => {
        if (entryId(p) !== eId) return p;
        return { ...p, takenAt };
      }),
    );
  }, []);

  /**
   * Persist all photos to the DB.
   * - New photos are created via photoRepository.createWithFiles
   * - Existing photos with a changed takenAt are updated via updateMeta
   * - Removed existing photos are deleted from the DB
   * Returns the final ordered list of photo IDs (index 0 = cover).
   */
  const saveAll = useCallback(async (): Promise<string[]> => {
    setSaving(true);
    setUploadProgress({});
    setUploadErrors({});
    const ids: string[] = [];
    const newErrors: Record<string, string> = {};
    try {
      for (const entry of photos) {
        if (entry.kind === "existing") {
          if (
            entry.takenAt != null &&
            entry.takenAt !== entry.originalTakenAt
          ) {
            await photoRepository.updateMeta(entry.id, {
              takenAt: entry.takenAt,
            });
          }
          ids.push(entry.id);
        } else {
          const localId = entry.localId;
          // Show the bar immediately (not waiting for first progress event)
          setUploadProgress((prev) => ({ ...prev, [localId]: 0 }));
          try {
            const saved = await photoRepository.createWithFiles(
              {
                thumbnailBlob: entry.processed.thumbnailBlob,
                displayBlob: entry.processed.displayBlob,
                ...(entry.processed.originalFile
                  ? { originalFile: entry.processed.originalFile }
                  : {}),
                width: entry.processed.width,
                height: entry.processed.height,
                takenAt: entry.takenAt,
              },
              (percent) => {
                setUploadProgress((prev) => ({ ...prev, [localId]: percent }));
              },
            );
            setUploadProgress((prev) => ({ ...prev, [localId]: 100 }));
            ids.push(saved.id);
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : "Upload fehlgeschlagen";
            newErrors[localId] = msg;
            setUploadErrors((prev) => ({ ...prev, [localId]: msg }));
          }
        }
      }
      // Clean up deleted existing photos from DB
      for (const id of removedExistingIdsRef.current) {
        await photoRepository.removeWithFiles(id);
      }
      removedExistingIdsRef.current = [];

      // After processing all photos, throw if any failed so the caller
      // (PlantFormPage) can display the error and prevent navigation.
      const failCount = Object.keys(newErrors).length;
      if (failCount > 0) {
        throw new Error(
          `${failCount} Foto${failCount > 1 ? "s" : ""} konnte${failCount > 1 ? "n" : ""} nicht hochgeladen werden. Bitte die markierten Fotos entfernen oder erneut speichern.`,
        );
      }
    } finally {
      setSaving(false);
    }
    return ids;
  }, [photos]);

  return {
    photos,
    loadExisting,
    addExisting,
    addNew,
    remove,
    setCover,
    updateTakenAt,
    saveAll,
    saving,
    uploadProgress,
    uploadErrors,
  };
}
