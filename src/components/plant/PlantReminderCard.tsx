import { useState, useEffect } from "react";
import { plantReminderRepository } from "../../db/index.ts";
import type {
  PlantReminder,
  ReminderCategory,
  ReminderRecurrence,
} from "../../db/pouchdb/repositories/plantReminderRepository.ts";
import { useToast } from "../ui/Toast.tsx";
import Card from "../ui/Card.tsx";
import Button from "../ui/Button.tsx";
import Input from "../ui/Input.tsx";

const CATEGORY_CONFIG: Record<ReminderCategory, { label: string; icon: React.ReactNode }> = {
  pruning: {
    label: "Schneiden",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />
        <line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" />
      </svg>
    ),
  },
  fertilizing: {
    label: "Düngen",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22V12" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" />
        <path d="M8 6h.01M16 6h.01M12 2h.01M12 6h.01M8 10h.01M16 10h.01" />
      </svg>
    ),
  },
  other: {
    label: "Sonstiges",
    icon: (
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
};

const RECURRENCE_OPTIONS: { value: ReminderRecurrence; label: string }[] = [
  { value: "once", label: "Einmalig" },
  { value: "biannual", label: "Halbjährlich" },
  { value: "yearly", label: "Jährlich" },
  { value: "every_2y", label: "Alle 2 Jahre" },
  { value: "every_3y", label: "Alle 3 Jahre" },
  { value: "every_4y", label: "Alle 4 Jahre" },
];

const RECURRENCE_LABELS: Record<ReminderRecurrence, string> = Object.fromEntries(
  RECURRENCE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ReminderRecurrence, string>;

const selectClass =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25";

interface ReminderSectionProps {
  plantId: string;
  category: ReminderCategory;
  existing: PlantReminder | undefined;
  onChanged: () => void;
}

function ReminderSection({ plantId, category, existing, onChanged }: ReminderSectionProps) {
  const config = CATEGORY_CONFIG[category];
  const { toast } = useToast();
  const [open, setOpen] = useState(!!existing);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const needsTitle = category === "other";
  const todayStr = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState(
    existing?.title ?? (needsTitle ? "" : config.label),
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [startDate, setStartDate] = useState(existing?.startDate ?? todayStr);
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>(existing?.recurrence ?? "yearly");

  // Sync form state when `existing` changes (e.g. after save)
  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setNotes(existing.notes ?? "");
      setStartDate(existing.startDate);
      setRecurrence(existing.recurrence);
    }
  }, [existing]);

  async function handleSave() {
    if (needsTitle && !title.trim()) {
      toast("Titel darf nicht leer sein", "error");
      return;
    }
    setSaving(true);
    try {
      await plantReminderRepository.upsert({
        plantId,
        category,
        title: needsTitle ? title.trim() : config.label,
        notes: notes.trim() || null,
        startDate,
        recurrence,
      });
      toast(`${config.label} gespeichert`);
      onChanged();
    } catch {
      toast("Fehler beim Speichern", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existing) return;
    setDeleting(true);
    try {
      await plantReminderRepository.remove(existing.id);
      toast(`${config.label}-Erinnerung gelöscht`);
      setConfirmDelete(false);
      setOpen(false);
      onChanged();
    } catch {
      toast("Fehler beim Löschen", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="border-b border-border-default last:border-0">
      {/* Section header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 py-3 text-left"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-text-secondary">
          {config.icon}
        </span>
        <span className="flex-1 text-sm font-medium text-text-primary">
          {config.label}
        </span>
        {existing ? (
          <div className="flex items-center gap-1.5">
            {existing.status === "expired" ? (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-text-muted">
                Abgelaufen
              </span>
            ) : (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">
                {existing.startDate} · {RECURRENCE_LABELS[existing.recurrence]}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs text-text-muted">Nicht konfiguriert</span>
        )}
        <svg
          className={`h-4 w-4 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Expanded form */}
      {open && (
        <div className="space-y-3 pb-4">
          {needsTitle && (
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Titel
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="z.B. Hecke zurückschneiden"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Startdatum
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <p className="mt-0.5 text-[10px] text-text-muted">
                Wird auf 1. oder 15. gerundet
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Wiederholung
              </label>
              <select
                className={selectClass}
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as ReminderRecurrence)}
              >
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">
              Notizen (optional)
            </label>
            <textarea
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25"
              rows={6}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Hinweise für die Aufgabe…"
            />
          </div>

          <div className="flex items-center gap-2">
            {existing && (
              <>
                {confirmDelete ? (
                  <>
                    <span className="text-xs text-text-secondary">Sicher löschen?</span>
                    <Button variant="danger" size="sm" onClick={() => void handleDelete()} disabled={deleting}>
                      {deleting ? "…" : "Ja, löschen"}
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setConfirmDelete(false)}>
                      Abbrechen
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} className="text-terracotta-600 hover:bg-terracotta-400/10">
                    Löschen
                  </Button>
                )}
              </>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="primary" size="sm" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Speichert…" : "Speichern"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PlantReminderCardProps {
  plantId: string;
}

export default function PlantReminderCard({ plantId }: PlantReminderCardProps) {
  const [reminders, setReminders] = useState<PlantReminder[] | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const data = await plantReminderRepository.getByPlantId(plantId);
      setReminders(data);
    } catch {
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantId]);

  const getReminder = (category: ReminderCategory) =>
    reminders?.find((r) => r.category === category);

  const categories: ReminderCategory[] = ["pruning", "fertilizing", "other"];

  return (
    <Card>
      <h2 className="font-display text-lg font-semibold text-text-heading">
        Pflegeerinnerungen
      </h2>
      <p className="mt-0.5 text-xs text-text-muted">
        Erstellt automatisch Aufgaben zum eingestellten Zeitpunkt.
      </p>

      {loading ? (
        <div className="mt-3 space-y-2">
          {categories.map((c) => (
            <div key={c} className="h-12 animate-pulse rounded-lg bg-surface-muted" />
          ))}
        </div>
      ) : (
        <div className="mt-3">
          {categories.map((category) => (
            <ReminderSection
              key={category}
              plantId={plantId}
              category={category}
              existing={getReminder(category)}
              onChanged={() => void load()}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
