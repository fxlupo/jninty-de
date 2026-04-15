import { useState, useCallback } from "react";
import CalendarViewSwitcher, {
  type CalendarView,
} from "../components/calendar/CalendarViewSwitcher.tsx";
import TimelineView from "../components/calendar/TimelineView.tsx";
import YearlyView from "../components/calendar/YearlyView.tsx";
import PlantingCalendarPage from "./PlantingCalendarPage.tsx";

export default function CalendarPage() {
  const [activeView, setActiveView] = useState<CalendarView>("timeline");
  const [drillMonth, setDrillMonth] = useState<Date | undefined>(undefined);

  // When drilling from yearly view into a specific month
  const handleDrillToMonth = useCallback((year: number, month: number) => {
    setDrillMonth(new Date(year, month, 1));
    setActiveView("monthly");
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <h1 className="font-display text-2xl font-bold text-text-heading">
          Kalender
        </h1>
        <CalendarViewSwitcher
          activeView={activeView}
          onViewChange={setActiveView}
        />
      </div>

      {/* View content */}
      <div className="mt-3">
        {activeView === "timeline" && <TimelineView />}
        {activeView === "monthly" && (
          <PlantingCalendarPage initialMonth={drillMonth} />
        )}
        {activeView === "yearly" && (
          <YearlyView onDrillToMonth={handleDrillToMonth} />
        )}
      </div>
    </div>
  );
}
