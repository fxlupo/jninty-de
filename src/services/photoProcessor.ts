export interface ProcessedPhoto {
  thumbnailBlob: Blob;
  displayBlob: Blob;
  originalFile?: Blob;
  width: number;
  height: number;
  /** ISO timestamp extracted from EXIF DateTimeOriginal, if available. */
  takenAt?: string;
}

import { parse as parseExif } from "exifr";

const THUMBNAIL_MAX_WIDTH = 320;
const THUMBNAIL_QUALITY = 0.7;
const DISPLAY_MAX_WIDTH = 1600;
const DISPLAY_QUALITY = 0.85;

/**
 * Load a File/Blob as an HTMLImageElement.
 */
function loadImage(source: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(source);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Das Bild konnte nicht geladen werden. Möglicherweise ist das Format nicht unterstützt."));
    };
    img.src = url;
  });
}

/**
 * Resize an image to fit within maxWidth and export as JPEG blob.
 * Images narrower than maxWidth are not upscaled.
 */
function resizeToBlob(
  img: HTMLImageElement,
  maxWidth: number,
  quality: number,
): Promise<Blob> {
  const scale = Math.min(1, maxWidth / img.naturalWidth);
  const width = Math.round(img.naturalWidth * scale);
  const height = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas 2d context");
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to create blob from canvas"));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Extract the DateTimeOriginal from EXIF metadata and return it as an ISO
 * timestamp. Returns undefined if no EXIF date is present or parsing fails
 * (e.g. PNG, screenshots, camera-roll copies without metadata).
 */
async function extractExifDate(file: File | Blob): Promise<string | undefined> {
  try {
    const exif = await parseExif(file, ["DateTimeOriginal"]);
    if (exif?.DateTimeOriginal instanceof Date && !isNaN(exif.DateTimeOriginal.getTime())) {
      return exif.DateTimeOriginal.toISOString();
    }
  } catch {
    // EXIF not available or unsupported format — silently ignore
  }
  return undefined;
}

/**
 * Process a photo file into thumbnail (320px) and display (1600px) variants.
 * Also extracts the EXIF DateTimeOriginal (if present) as takenAt.
 *
 * Note: The design doc (§5.4) envisions staggered processing — show
 * thumbnail immediately while generating the display size in the background.
 * Currently both are generated together in a single call. When the journal
 * quick-entry UI is built, consider splitting into two sequential steps.
 */
export async function processPhoto(
  file: File | Blob,
): Promise<ProcessedPhoto> {
  const fileName = file instanceof File ? file.name.toLowerCase() : "";
  const isHeic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    fileName.endsWith(".heic") ||
    fileName.endsWith(".heif");
  if (isHeic) {
    throw new Error(
      "HEIC-Fotos werden im Browser nicht unterstützt. Bitte konvertiere das Foto zuerst in JPEG oder PNG.",
    );
  }
  if (!file.type.startsWith("image/")) {
    throw new Error(
      `Das Dateiformat wird nicht unterstützt (${file.type || "unbekannt"}). Bitte verwende JPEG, PNG oder WebP.`,
    );
  }

  const img = await loadImage(file);
  const width = img.naturalWidth;
  const height = img.naturalHeight;

  const [thumbnailBlob, displayBlob, takenAt] = await Promise.all([
    resizeToBlob(img, THUMBNAIL_MAX_WIDTH, THUMBNAIL_QUALITY),
    resizeToBlob(img, DISPLAY_MAX_WIDTH, DISPLAY_QUALITY),
    extractExifDate(file),
  ]);

  return {
    thumbnailBlob,
    displayBlob,
    width,
    height,
    ...(takenAt != null ? { takenAt } : {}),
  };
}

/**
 * Process a photo, optionally preserving the original file in memory.
 * The original file is kept as a reference for later OPFS storage
 * when `keepOriginal` is true.
 */
export async function processPhotoWithOriginal(
  file: File | Blob,
  options: { keepOriginal: boolean },
): Promise<ProcessedPhoto> {
  const result = await processPhoto(file);
  if (options.keepOriginal) {
    return { ...result, originalFile: file };
  }
  return result;
}

/**
 * Open a hidden file input, wait for the user to pick a file.
 * Uses the `cancel` event (Chrome 113+, Safari 16.4+) for reliable
 * cancellation detection, with no fallback rejection for older browsers
 * (the promise simply never settles — callers should handle this via
 * AbortController or UI-level timeouts if needed).
 */
export function openFileInput(options: {
  capture?: string;
}): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    if (options.capture) {
      input.capture = options.capture;
    }

    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (file) {
        resolve(file);
      } else {
        reject(new Error("No file selected"));
      }
    });

    // The `cancel` event fires when the user dismisses the file picker.
    // Supported in Chrome 113+, Safari 16.4+. On older browsers the
    // promise simply never settles if the user cancels.
    input.addEventListener("cancel", () => {
      reject(new Error("File selection cancelled"));
    });

    input.click();
  });
}

/**
 * Open the device camera via a hidden file input with capture="environment".
 * Returns the captured file. Rejects if the user cancels (on supported browsers).
 */
export function captureFromCamera(): Promise<File> {
  return openFileInput({ capture: "environment" });
}

/**
 * Open a file picker for selecting an image.
 * Returns the selected file. Rejects if the user cancels (on supported browsers).
 */
export function selectFile(): Promise<File> {
  return openFileInput({});
}

// TODO: Add pasteFromClipboard() — design doc §5.4 requires clipboard paste
// input. Implement using navigator.clipboard.read() or a paste event listener.
