import Button from "../ui/Button";
import { CloseIcon } from "../icons";
import type { PhotoEntry } from "../../hooks/usePlantPhotoManager";
import { entryId } from "../../hooks/usePlantPhotoManager";

// ─── Star icon for "Als Titelbild setzen" ───

function StarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

// ─── Props ───

interface PlantPhotoManagerProps {
  photos: PhotoEntry[];
  onRemove: (entryId: string) => void;
  onSetCover: (entryId: string) => void;
  onUpdateTakenAt: (entryId: string, takenAt: string) => void;
  onCapturePhoto: () => Promise<void>;
  onSelectPhoto: () => Promise<void>;
  isProcessing: boolean;
  error?: Error | null;
}

// ─── Component ───

export default function PlantPhotoManager({
  photos,
  onRemove,
  onSetCover,
  onUpdateTakenAt,
  onCapturePhoto,
  onSelectPhoto,
  isProcessing,
  error,
}: PlantPhotoManagerProps) {
  return (
    <div>
      {/* Photo grid */}
      {photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((entry, index) => {
            const id = entryId(entry);
            const isCover = index === 0;
            const dateValue = entry.takenAt ? entry.takenAt.slice(0, 10) : "";

            return (
              <div key={id} className="flex flex-col gap-1.5">
                {/* Thumbnail with action overlays */}
                <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-muted">
                  <img
                    src={entry.previewUrl}
                    alt="Pflanzenfoto"
                    className="h-full w-full object-cover"
                  />

                  {/* Cover badge */}
                  {isCover && (
                    <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-text-on-primary">
                      <StarIcon className="h-2.5 w-2.5" />
                      Titelbild
                    </div>
                  )}

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => onRemove(id)}
                    className="absolute top-1.5 right-1.5 rounded-full bg-soil-900/60 p-1 text-white transition-colors hover:bg-soil-900/80"
                    aria-label="Foto entfernen"
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>

                  {/* Set cover button (only on non-cover photos) */}
                  {!isCover && (
                    <button
                      type="button"
                      onClick={() => onSetCover(id)}
                      className="absolute bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-soil-900/60 px-2 py-0.5 text-[10px] text-white transition-colors hover:bg-soil-900/80"
                      aria-label="Als Titelbild setzen"
                    >
                      Als Titelbild
                    </button>
                  )}
                </div>

                {/* Aufnahmedatum */}
                <input
                  type="date"
                  value={dateValue}
                  onChange={(e) => {
                    if (e.target.value) {
                      onUpdateTakenAt(id, new Date(e.target.value).toISOString());
                    }
                  }}
                  className="w-full rounded-lg border border-border-strong bg-surface px-2 py-1 text-xs text-text-secondary focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
                  aria-label="Aufnahmedatum"
                  title="Aufnahmedatum"
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-border-strong bg-surface">
          <p className="text-sm text-text-secondary">Noch keine Fotos hinzugefügt</p>
        </div>
      )}

      {/* Add buttons */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={isProcessing}
          onClick={() => void onCapturePhoto()}
        >
          {isProcessing ? "Wird verarbeitet..." : "Foto aufnehmen"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isProcessing}
          onClick={() => void onSelectPhoto()}
        >
          {isProcessing ? "Wird verarbeitet..." : "Foto auswählen"}
        </Button>
      </div>

      {error && (
        <p className="mt-1.5 text-sm text-terracotta-600">{error.message}</p>
      )}
    </div>
  );
}
