import { db } from "../db/schema.ts";

export type StorageUsage = {
  photosBytes: number;
  dataBytes: number;
  totalBytes: number;
};

export async function getStorageUsage(): Promise<StorageUsage> {
  // Sum photo blob sizes
  let photosBytes = 0;
  await db.photos.each((photo) => {
    photosBytes += photo.thumbnailBlob.size;
    if (photo.displayBlob) {
      photosBytes += photo.displayBlob.size;
    }
  });

  // Use Storage API estimate when available
  let totalBytes = 0;
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    totalBytes = estimate.usage ?? 0;
  }

  const dataBytes = Math.max(0, totalBytes - photosBytes);
  return { photosBytes, dataBytes, totalBytes };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
