import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { parseISO, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { PRIORITY_LABELS, PRIORITY_VARIANT } from "../../constants/taskLabels";
import { formatDate } from "../../lib/locale";
import type { Task } from "../../types";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { CloseIcon } from "../icons";

interface TaskDetailModalProps {
  task: Task;
  plantName: string | undefined;
  onClose: () => void;
  onComplete: () => void;
}

export default function TaskDetailModal({
  task,
  plantName,
  onClose,
  onComplete,
}: TaskDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = task.dueDate < today;
  const timeAgo = formatDistanceToNow(parseISO(task.dueDate), {
    addSuffix: true,
    locale: de,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Aufgabe Details"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg rounded-t-2xl bg-surface-elevated md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={PRIORITY_VARIANT[task.priority]}>
              {PRIORITY_LABELS[task.priority]}
            </Badge>
            {isOverdue && (
              <span className="rounded-full bg-terracotta-400/15 px-2 py-0.5 text-xs font-medium text-terracotta-600">
                Überfällig
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
            aria-label="Schliessen"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <h2 className="font-display text-lg font-semibold text-text-primary">
            {task.title}
          </h2>

          {task.description && (
            <p className="mt-2 text-sm leading-relaxed text-text-secondary whitespace-pre-wrap">
              {task.description}
            </p>
          )}

          <div className="mt-4 space-y-1 text-xs text-text-secondary">
            <p>
              <span className={isOverdue ? "font-medium text-terracotta-600" : ""}>
                Fällig: {formatDate(parseISO(task.dueDate), "d. MMMM yyyy")}
              </span>
              {" "}
              <span className="text-text-muted">({timeAgo})</span>
            </p>
            {plantName && task.plantInstanceId && (
              <p>
                Pflanze:{" "}
                <Link
                  to={`/plants/${task.plantInstanceId}`}
                  className="font-medium text-text-heading hover:underline"
                  onClick={onClose}
                >
                  {plantName}
                </Link>
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="mt-4 flex gap-2 border-t border-border-default pt-4">
            <Button variant="primary" onClick={onComplete}>
              Erledigen
            </Button>
            <Link
              to="/tasks"
              onClick={onClose}
              className="flex items-center rounded-lg border border-border-strong px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-muted"
            >
              Alle Aufgaben
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
