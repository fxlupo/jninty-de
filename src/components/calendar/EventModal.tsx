import { useState } from "react";
import type {
  CalendarEvent,
  CalendarEventInput,
  CalendarEventType,
  CalendarEventRecurrence,
} from "../../db/pouchdb/repositories/calendarEventRepository.ts";
import { calendarEventRepository } from "../../db/index.ts";
import Button from "../ui/Button.tsx";
import Input from "../ui/Input.tsx";
import { useToast } from "../ui/Toast.tsx";

const TYPE_OPTIONS: { value: CalendarEventType; label: string }[] = [
  { value: "general", label: "Allgemein" },
  { value: "task", label: "Aufgabe" },
  { value: "reminder", label: "Erinnerung" },
];

const RECURRENCE_OPTIONS: { value: CalendarEventRecurrence; label: string }[] = [
  { value: "once", label: "Einmalig" },
  { value: "yearly", label: "Jährlich" },
  { value: "every_2y", label: "Alle 2 Jahre" },
  { value: "every_3y", label: "Alle 3 Jahre" },
  { value: "every_4y", label: "Alle 4 Jahre" },
];

const selectClass =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25";

interface EventModalProps {
  event?: CalendarEvent | null;
  initialDate?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function EventModal({ event, initialDate, onClose, onSaved }: EventModalProps) {
  const isEdit = event != null;
  const { toast } = useToast();

  const [title, setTitle] = useState(event?.title ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [date, setDate] = useState(event?.date ?? initialDate ?? new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<CalendarEventType>(event?.type ?? "general");
  const [recurrence, setRecurrence] = useState<CalendarEventRecurrence>(event?.recurrence ?? "once");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!title.trim()) {
      toast("Titel darf nicht leer sein", "error");
      return;
    }
    setSaving(true);
    try {
      const input: CalendarEventInput = {
        title: title.trim(),
        notes: notes.trim() || null,
        date,
        type,
        recurrence,
      };
      if (isEdit) {
        await calendarEventRepository.update(event.id, input);
        toast("Eintrag gespeichert");
      } else {
        await calendarEventRepository.create(input);
        toast("Eintrag erstellt");
      }
      onSaved();
      onClose();
    } catch {
      toast("Fehler beim Speichern", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isEdit) return;
    setSaving(true);
    try {
      await calendarEventRepository.remove(event.id);
      toast("Eintrag gelöscht");
      onSaved();
      onClose();
    } catch {
      toast("Fehler beim Löschen", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onKeyDown={handleKeyDown}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-t-2xl bg-surface-elevated p-5 shadow-xl sm:rounded-2xl">
        <h2 className="mb-4 font-display text-lg font-bold text-text-heading">
          {isEdit ? "Eintrag bearbeiten" : "Neuer Eintrag"}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Titel
            </label>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel eingeben…"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Datum
            </label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Typ
              </label>
              <select
                className={selectClass}
                value={type}
                onChange={(e) => setType(e.target.value as CalendarEventType)}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Wiederholung
              </label>
              <select
                className={selectClass}
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as CalendarEventRecurrence)}
              >
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Notizen
            </label>
            <textarea
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optionale Notizen…"
            />
          </div>
        </div>

        <div className="mt-5 flex items-center gap-2">
          {isEdit && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={saving}
            >
              Löschen
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Abbrechen
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Speichern…" : "Speichern"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
