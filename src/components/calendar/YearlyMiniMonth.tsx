import { useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  format,
} from "date-fns";
import { de } from "date-fns/locale";
import type { CalendarEvent } from "../../db/pouchdb/repositories/calendarEventRepository.ts";

const MINI_WEEK_DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

interface YearlyMiniMonthProps {
  year: number;
  month: number;
  events: CalendarEvent[];
  onMonthClick: (year: number, month: number) => void;
}

export default function YearlyMiniMonth({
  year,
  month,
  events,
  onMonthClick,
}: YearlyMiniMonthProps) {
  const monthDate = useMemo(() => new Date(year, month, 1), [year, month]);
  const today = new Date();

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    // Start week on Monday (weekStartsOn: 1)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [monthDate]);

  const daysWithEvents = useMemo(() => {
    const set = new Set<string>();
    for (const event of events) {
      set.add(event.date);
    }
    return set;
  }, [events]);

  return (
    <div className="rounded-lg border border-border-default bg-surface-elevated p-2.5">
      <button
        type="button"
        onClick={() => onMonthClick(year, month)}
        className="mb-1.5 w-full text-left text-sm font-semibold text-text-heading transition-colors hover:text-primary"
      >
        {format(monthDate, "MMMM", { locale: de })}
      </button>

      <div className="grid grid-cols-7 gap-0">
        {MINI_WEEK_DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] leading-tight text-text-muted">
            {d.charAt(0)}
          </div>
        ))}
      </div>

      <div className="mt-0.5 grid grid-cols-7 gap-0">
        {calendarDays.map((day) => {
          const inMonth = isSameMonth(day, monthDate);
          const isToday = isSameDay(day, today);
          const dateKey = format(day, "yyyy-MM-dd");
          const hasEvents = daysWithEvents.has(dateKey);

          if (!inMonth) return <div key={dateKey} className="h-7" />;

          return (
            <div
              key={dateKey}
              className="flex h-7 flex-col items-center justify-start gap-0.5"
            >
              <span
                className={`text-xs leading-tight ${
                  isToday ? "font-bold text-primary" : "text-text-secondary"
                }`}
              >
                {format(day, "d")}
              </span>
              {hasEvents && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
