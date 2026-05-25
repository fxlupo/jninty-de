import { useState, useMemo, useCallback } from "react";
import { usePouchQuery } from "../../hooks/usePouchQuery.ts";
import { calendarEventRepository } from "../../db/index.ts";
import YearlyMiniMonth from "./YearlyMiniMonth.tsx";
import Skeleton from "../ui/Skeleton.tsx";

interface YearlyViewProps {
  onDrillToMonth: (year: number, month: number) => void;
}

export default function YearlyView({ onDrillToMonth }: YearlyViewProps) {
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());

  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  const allYearEvents = usePouchQuery(
    () => calendarEventRepository.getRange(yearStart, yearEnd),
    [yearStart, yearEnd],
  );

  const eventsByMonth = useMemo(() => {
    const map = new Map<number, typeof allYearEvents>([]);
    for (let m = 0; m < 12; m++) map.set(m, []);
    if (!allYearEvents) return map;
    for (const event of allYearEvents) {
      const monthIndex = parseInt(event.date.slice(5, 7), 10) - 1;
      map.get(monthIndex)?.push(event);
    }
    return map;
  }, [allYearEvents]);

  const handlePrevYear = useCallback(() => setCurrentYear((y) => y - 1), []);
  const handleNextYear = useCallback(() => setCurrentYear((y) => y + 1), []);
  const handleToday = useCallback(() => setCurrentYear(new Date().getFullYear()), []);

  if (allYearEvents === undefined) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handlePrevYear}
          aria-label="Vorheriges Jahr"
          className="rounded-lg p-1.5 text-text-heading transition-colors hover:bg-surface-muted"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="font-display text-lg font-semibold text-text-heading">
          {currentYear}
        </h2>
        <button
          type="button"
          onClick={handleNextYear}
          aria-label="Nächstes Jahr"
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
        <span className="ml-auto text-xs text-text-muted">
          {allYearEvents.length} Einträge
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
        {Array.from({ length: 12 }).map((_, monthIndex) => (
          <YearlyMiniMonth
            key={monthIndex}
            year={currentYear}
            month={monthIndex}
            events={eventsByMonth.get(monthIndex) ?? []}
            onMonthClick={onDrillToMonth}
          />
        ))}
      </div>
    </div>
  );
}
