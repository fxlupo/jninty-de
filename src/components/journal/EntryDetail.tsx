import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { photoRepository } from "../../db/index.ts";
import { formatTemp } from "../../services/weather";
import { ACTIVITY_LABELS } from "../../constants/plantLabels";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { JournalEntry } from "../../types";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import Card from "../ui/Card";
import { CloseIcon } from "../icons";

interface EntryDetailProps {
  entry: JournalEntry;
  plantName: string | undefined;
  temperatureUnit: "fahrenheit" | "celsius";
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function EntryDetail({
  entry,
  plantName,
  temperatureUnit,
  onClose,
  onEdit,
  onDelete,
}: EntryDetailProps) {
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef);

  useEffect(() => {
    const firstPhotoId = entry.photoIds[0];
    if (!firstPhotoId) return;
    let cancelled = false;
    void photoRepository.getDisplayUrl(firstPhotoId).then((url) => {
      if (cancelled) return;
      if (url) setDisplayUrl(url);
    });
    return () => { cancelled = true; };
  }, [entry.photoIds]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const timeAgo = formatDistanceToNow(new Date(entry.createdAt), {
    addSuffix: true,
    locale: de,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 pb-16 md:items-center md:pb-0"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Journaleintrag Details"
    >
      <div
        ref={modalRef}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface-elevated md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <Badge>{ACTIVITY_LABELS[entry.activityType]}</Badge>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
            aria-label="Schliessen"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {displayUrl && (
          <img src={displayUrl} alt="Entry photo" className="mt-3 w-full object-cover" />
        )}

        <div className="p-4">
          {entry.title && (
            <h2 className="font-display text-lg font-semibold text-text-primary">
              {entry.title}
            </h2>
          )}

          <p className="mt-2 text-sm leading-relaxed text-text-secondary whitespace-pre-wrap">
            {entry.body}
          </p>

          <div className="mt-4 space-y-1 text-xs text-text-secondary">
            <p>{timeAgo}</p>
            {plantName && (
              <p>
                Pflanze:{" "}
                <Link
                  to={`/plants/${entry.plantInstanceId}`}
                  className="font-medium text-text-heading hover:underline"
                >
                  {plantName}
                </Link>
              </p>
            )}
            {entry.weatherSnapshot?.tempC != null && (
              <p>
                Wetter:{" "}
                <span className="font-medium text-text-secondary">
                  {formatTemp(entry.weatherSnapshot.tempC, temperatureUnit)}
                  {entry.weatherSnapshot.conditions ? `, ${entry.weatherSnapshot.conditions}` : ""}
                  {entry.weatherSnapshot.humidity != null
                    ? ` (${String(entry.weatherSnapshot.humidity)}% Feuchte)`
                    : ""}
                </span>
              </p>
            )}
            {entry.isMilestone && entry.milestoneType && (
              <p>
                Meilenstein:{" "}
                <span className="font-medium text-text-secondary">
                  {entry.milestoneType.replace(/_/g, " ")}
                </span>
              </p>
            )}
            {entry.activityType === "harvest" && entry.harvestWeight != null && (
              <p>
                Ernte:{" "}
                <span className="font-medium text-text-secondary">{entry.harvestWeight}g</span>
              </p>
            )}
          </div>

          <div className="mt-4 flex gap-2 border-t border-border-default pt-4">
            <Button variant="secondary" onClick={onEdit}>
              Bearbeiten
            </Button>
            <Button
              variant="ghost"
              className="text-red-600 hover:text-red-700"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Löschen
            </Button>
          </div>

          {showDeleteConfirm && (
            <Card className="mt-3 border-terracotta-400/30 bg-terracotta-400/5">
              <p className="text-sm text-text-secondary">
                Journaleintrag löschen? Dies kann nicht rückgängig gemacht werden.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>
                  Abbrechen
                </Button>
                <Button
                  variant="primary"
                  className="bg-accent hover:bg-accent-hover"
                  onClick={onDelete}
                >
                  Löschen
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
