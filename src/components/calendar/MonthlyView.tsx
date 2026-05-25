import { useState, useMemo, useCallback } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
  addMonths,
  subMonths,
} from "date-fns";
import { de } from "date-fns/locale";
import { usePouchQuery } from "../../hooks/usePouchQuery.ts";
import { calendarEventRepository } from "../../db/index.ts";
import type { CalendarEvent } from "../../db/pouchdb/repositories/calendarEventRepository.ts";
import EventModal from "./EventModal.tsx";

const WEEKDAY_LABELS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const TYPE_COLORS: Record<CalendarEvent["type"], string> = {
  general: "bg-green-600",
  task: "bg-terracotta-500",
  reminder: "bg-brown-500",
};

interface MonthlyViewProps {
  initialMonth?: Date | undefined;
}

export default function MonthlyView({ initialMonth }: MonthlyViewProps) {
  const [currentMonth, setCurrentMonth] = useState(
    () => initialMonth ?? new Date(),
  );
  const [modalState, setModalState] = useState<
    | { mode: "create"; date: string }
    | { mode: "edit"; event: CalendarEvent }
    | null
  >(null);

  const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

  const monthEvents = usePouchQuery(
    () => calendarEventRepository.getRange(monthStart, monthEnd),
    [monthStart, monthEnd],
  );

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    if (!monthEvents) return map;
    for (const event of monthEvents) {
      const existing = map.get(event.date);
      if (existing) existing.push(event);
      else map.set(event.date, [event]);
    }
    return map;
  }, [monthEvents]);

  const handlePrevMonth = useCallback(() => setCurrentMonth((m) => subMonths(m, 1)), []);
  const handleNextMonth = useCallback(() => setCurrentMonth((m) => addMonths(m, 1)), []);
  const handleToday = useCallback(() => setCurrentMonth(new Date()), []);

  const today = new Date();

  return (
    <div className="p-4">
      {/* Navigation */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePrevMonth}
          aria-label="Vorheriger Monat"
          className="rounded-lg p-1.5 text-text-heading transition-colors hover:bg-surface-muted"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="font-display text-lg font-semibold text-text-heading">
          {format(currentMonth, "MMMM yyyy", { locale: de })}
        </h2>
        <button
          type="button"
          onClick={handleNextMonth}
          aria-label="Nächster Monat"
          className="rounded-lg p-1.5 text-text-heading transition-colors hover:bg-surface-muted"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleToday}
          className="ml-1 rounded-lg border border-border-default px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-muted"
        >
          Heute
        </button>
        <button
          type="button"
          onClick={() => setModalState({ mode: "create", date: format(today, "yyyy-MM-dd") })}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-text-on-primary transition-colors hover:bg-primary-hover"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Neu
        </button>
      </div>

      {/* Weekday headers */}
      <div className="mt-4 grid grid-cols-7 border-b border-border-default">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="pb-1.5 text-center text-xs font-medium text-text-muted">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 border-l border-border-default">
        {calendarDays.map((day) => {
          const inMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, today);
          const dateKey = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDate.get(dateKey) ?? [];

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => setModalState({ mode: "create", date: dateKey })}
              className={`min-h-[80px] border-b border-r border-border-default p-1.5 text-left transition-colors hover:bg-surface-muted ${
                !inMonth ? "opacity-30" : ""
              }`}
            >
              <span
                className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  isToday
                    ? "bg-primary font-bold text-text-on-primary"
                    : "text-text-secondary"
                }`}
              >
                {format(day, "d")}
              </span>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalState({ mode: "edit", event });
                    }}
                    className={`block w-full truncate rounded px-1 py-0.5 text-left text-[11px] font-medium text-white transition-opacity hover:opacity-80 ${TYPE_COLORS[event.type]}`}
                  >
                    {event.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className="text-[10px] text-text-muted">
                    +{dayEvents.length - 3} mehr
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3">
        <span className="flex items-center gap-1.5 text-xs text-text-muted">
          <span className="h-2.5 w-2.5 rounded bg-green-600" /> Allgemein
        </span>
        <span className="flex items-center gap-1.5 text-xs text-text-muted">
          <span className="h-2.5 w-2.5 rounded bg-terracotta-500" /> Aufgabe
        </span>
        <span className="flex items-center gap-1.5 text-xs text-text-muted">
          <span className="h-2.5 w-2.5 rounded bg-brown-500" /> Erinnerung
        </span>
      </div>

      {/* Modal */}
      {modalState?.mode === "create" && (
        <EventModal
          initialDate={modalState.date}
          onClose={() => setModalState(null)}
          onSaved={() => setModalState(null)}
        />
      )}
      {modalState?.mode === "edit" && (
        <EventModal
          event={modalState.event}
          onClose={() => setModalState(null)}
          onSaved={() => setModalState(null)}
        />
      )}
    </div>
  );
}
