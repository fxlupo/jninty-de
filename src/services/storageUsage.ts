export type StorageUsage = {
  thumbnailBytes: number;
  displayBytes: number;
  originalBytes: number;
  dataBytes: number;
  totalBytes: number;
  quotaBytes: number;
};

export async function getStorageUsage(): Promise<StorageUsage> {
  // Photos are stored server-side; client-side sizes not directly available.
  // Use the Storage API for total usage estimate.
  let totalBytes = 0;
  let quotaBytes = 0;
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    totalBytes = estimate.usage ?? 0;
    quotaBytes = estimate.quota ?? 0;
  }

  return {
    thumbnailBytes: 0,
    displayBytes: 0,
    originalBytes: 0,
    dataBytes: totalBytes,
    totalBytes,
    quotaBytes,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
