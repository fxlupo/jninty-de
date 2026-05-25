import { useState, useMemo } from "react";
import { format, addMonths } from "date-fns";
import { de } from "date-fns/locale";
import { usePouchQuery } from "../../hooks/usePouchQuery.ts";
import { calendarEventRepository } from "../../db/index.ts";
import type { CalendarEvent } from "../../db/pouchdb/repositories/calendarEventRepository.ts";
import EventModal from "./EventModal.tsx";
import Skeleton from "../ui/Skeleton.tsx";

const TYPE_LABELS: Record<CalendarEvent["type"], string> = {
  general: "Allgemein",
  task: "Aufgabe",
  reminder: "Erinnerung",
};

const RECURRENCE_LABELS: Record<CalendarEvent["recurrence"], string> = {
  once: "",
  yearly: "Jährlich",
  every_2y: "Alle 2 Jahre",
  every_3y: "Alle 3 Jahre",
  every_4y: "Alle 4 Jahre",
};

const TYPE_BADGE_CLASSES: Record<CalendarEvent["type"], string> = {
  general: "bg-green-100 text-green-800",
  task: "bg-terracotta-100 text-terracotta-700",
  reminder: "bg-brown-100 text-brown-700",
};

function formatMonthHeading(dateStr: string): string {
  const [year, month] = dateStr.split("-").map(Number);
  return format(new Date(year ?? 0, (month ?? 1) - 1, 1), "MMMM yyyy", { locale: de });
}

export default function TimelineView() {
  const today = new Date();
  const from = format(today, "yyyy-MM-dd");
  const to = format(addMonths(today, 3), "yyyy-MM-dd");

  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const events = usePouchQuery(
    () => calendarEventRepository.getRange(from, to),
    [from, to],
  );

  const groupedEvents = useMemo(() => {
    if (!events) return [];
    const groups = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const monthKey = event.date.slice(0, 7);
      const existing = groups.get(monthKey);
      if (existing) existing.push(event);
      else groups.set(monthKey, [event]);
    }
    return Array.from(groups.entries()).map(([monthKey, evts]) => ({
      monthKey,
      events: evts,
    }));
  }, [events]);

  if (events === undefined) {
    return (
      <div className="space-y-4 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-text-muted">Nächste 3 Monate</p>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-text-on-primary transition-colors hover:bg-primary-hover"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Neuer Eintrag
        </button>
      </div>

      {groupedEvents.length === 0 ? (
        <div className="rounded-xl border border-border-default bg-surface-elevated px-6 py-10 text-center">
          <p className="text-sm text-text-muted">Keine Einträge in den nächsten 3 Monaten</p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="mt-3 text-sm font-medium text-primary hover:underline"
          >
            Ersten Eintrag erstellen
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedEvents.map(({ monthKey, events: monthEvents }) => (
            <div key={monthKey}>
              <h3 className="mb-2 text-sm font-semibold text-text-heading capitalize">
                {formatMonthHeading(monthKey + "-01")}
              </h3>
              <div className="space-y-2">
                {monthEvents.map((event) => (
                  <button
                    key={`${event.id}-${event.date}`}
                    type="button"
                    onClick={() => setEditEvent(event)}
                    className="flex w-full items-start gap-3 rounded-xl border border-border-default bg-surface-elevated p-3 text-left transition-colors hover:bg-surface-muted"
                  >
                    <div className="mt-0.5 flex-shrink-0 text-center">
                      <div className="text-xl font-bold leading-none text-text-heading">
                        {event.date.slice(8)}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        {format(
                          new Date(
                            parseInt(event.date.slice(0, 4)),
                            parseInt(event.date.slice(5, 7)) - 1,
                            parseInt(event.date.slice(8, 10)),
                          ),
                          "EEE",
                          { locale: de },
                        )}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-text-primary">
                        {event.title}
                      </p>
                      {event.notes && (
                        <p className="mt-0.5 truncate text-xs text-text-muted">
                          {event.notes}
                        </p>
                      )}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TYPE_BADGE_CLASSES[event.type]}`}>
                          {TYPE_LABELS[event.type]}
                        </span>
                        {event.recurrence !== "once" && (
                          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-text-muted">
                            {RECURRENCE_LABELS[event.recurrence]}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <EventModal
          onClose={() => setShowCreate(false)}
          onSaved={() => setShowCreate(false)}
        />
      )}
      {editEvent && (
        <EventModal
          event={editEvent}
          onClose={() => setEditEvent(null)}
          onSaved={() => setEditEvent(null)}
        />
      )}
    </div>
  );
}
