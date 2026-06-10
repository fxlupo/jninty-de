import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePouchQuery } from "../hooks/usePouchQuery.ts";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { formatDistanceToNow, startOfWeek, startOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import { journalRepository, plantRepository, seasonRepository } from "../db/index.ts";
import { removeFromIndex, serializeIndex } from "../db/search";
import {
  search as searchIndex,
  loadIndex,
  rebuildIndex,
} from "../db/search";
import type { ActivityType, JournalEntry } from "../types";
import {
  ACTIVITY_LABELS,
  ALL_ACTIVITY_TYPES,
} from "../constants/plantLabels";
import { useDebounce } from "../hooks/useDebounce";
import { useSettings } from "../hooks/useSettings";
import { useToast } from "../components/ui/Toast";
import { formatTemp } from "../services/weather";
import Badge from "../components/ui/Badge";
import Input from "../components/ui/Input";
import PhotoThumbnail from "../components/PhotoThumbnail";
import { PlusIcon, ClipboardCheckIcon } from "../components/icons";
import Skeleton from "../components/ui/Skeleton";
import EntryDetail from "../components/journal/EntryDetail";

// ─── Constants ───

const ITEM_HEIGHT = 120;
const VIRTUALIZE_THRESHOLD = 20;

type DateRange = "all" | "week" | "month";

const selectClass =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25";

// ─── Entry row component (defined outside for react-window perf) ───

type RowData = {
  entries: JournalEntry[];
  plantNames: Map<string, string>;
  temperatureUnit: "fahrenheit" | "celsius";
  onSelect: (entry: JournalEntry) => void;
};

function EntryRow({ index, style, data }: ListChildComponentProps<RowData>) {
  const entry = data.entries[index];
  if (!entry) return null;

  const plantName = entry.plantInstanceId
    ? data.plantNames.get(entry.plantInstanceId)
    : undefined;
  const firstPhotoId = entry.photoIds[0];
  const timeAgo = formatDistanceToNow(new Date(entry.createdAt), {
    addSuffix: true,
    locale: de,
  });

  return (
    <div style={style} className="px-4 py-1">
      <button
        type="button"
        onClick={() => data.onSelect(entry)}
        className="flex w-full gap-3 rounded-xl border border-border-default bg-surface-elevated p-3 text-left shadow-sm transition-shadow hover:shadow-md"
        aria-label={`Journaleintrag: ${entry.body.slice(0, 50)}`}
      >
        {/* Photo or activity placeholder */}
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
          {firstPhotoId ? (
            <PhotoThumbnail
              photoId={firstPhotoId}
              alt="Eintragsfoto"
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm font-medium text-brown-500">
              {ACTIVITY_LABELS[entry.activityType].slice(0, 3)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge>{ACTIVITY_LABELS[entry.activityType]}</Badge>
            {entry.weatherSnapshot?.tempC != null && (
              <span className="text-xs text-text-muted">
                {formatTemp(entry.weatherSnapshot.tempC, data.temperatureUnit)}
              </span>
            )}
            {plantName && (
              <span className="truncate text-xs text-text-secondary">
                {plantName}
              </span>
            )}
            <span className="ml-auto shrink-0 text-xs text-text-muted">
              {timeAgo}
            </span>
          </div>
          {entry.title && (
            <p className="mt-0.5 truncate text-sm font-medium text-text-primary">
              {entry.title}
            </p>
          )}
          <p className="mt-0.5 line-clamp-2 text-sm text-text-secondary">
            {entry.body}
          </p>
        </div>
      </button>
    </div>
  );
}

// ─── FAB ───

function AddEntryFab() {
  return (
    <div className="fixed bottom-24 right-4 z-40 md:bottom-6">
      <Link
        to="/journal/new"
        aria-label="Neuer Journaleintrag"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-text-on-primary shadow-lg transition-transform hover:bg-primary-hover active:scale-95"
      >
        <PlusIcon className="h-7 w-7" />
      </Link>
    </div>
  );
}

// ─── Main page component ───

export default function JournalPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { settings } = useSettings();
  const allEntries = usePouchQuery(() => journalRepository.getAll());
  const allPlants = usePouchQuery(() => plantRepository.getAll());
  const allSeasons = usePouchQuery(() => seasonRepository.getAll());
  const activeSeason = usePouchQuery(() => seasonRepository.getActive());

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [activityFilter, setActivityFilter] = useState<ActivityType | "">("");
  const [plantFilter, setPlantFilter] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  // null = user hasn't interacted yet, use active season; "" = "All Seasons"; string = specific season
  const [seasonFilter, setSeasonFilter] = useState<string | null>(null);
  const [indexReady, setIndexReady] = useState(false);

  // Detail overlay
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(
    null,
  );

  // Delete handler
  const handleDeleteEntry = useCallback(async (entry: JournalEntry) => {
    try {
      await journalRepository.softDelete(entry.id);
      removeFromIndex(entry.id);
      void serializeIndex();
      setSelectedEntry(null);
      toast("Journal entry deleted", "success");
    } catch {
      toast("Eintrag konnte nicht gelöscht werden", "error");
    }
  }, [toast]);

  // List container height
  const [listHeight, setListHeight] = useState(400);
  const containerRef = useRef<HTMLDivElement>(null);

  // Derive effective season filter: default to active season until user interacts
  const effectiveSeasonFilter =
    seasonFilter === null ? (activeSeason?.id ?? "") : seasonFilter;

  // Load search index on mount
  useEffect(() => {
    void loadIndex()
      .then((loaded: boolean) => {
        if (!loaded) {
          return rebuildIndex();
        }
      })
      .then(() => {
        setIndexReady(true);
      });
  }, []);

  // Measure container height for react-window
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const first = entries[0];
      if (first) setListHeight(first.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Build plant name map
  const plantNames = useMemo(() => {
    const map = new Map<string, string>();
    if (!allPlants) return map;
    for (const p of allPlants) {
      map.set(p.id, p.nickname ?? p.species);
    }
    return map;
  }, [allPlants]);

  // Filter entries
  const filteredEntries = useMemo(() => {
    if (!allEntries) return [];
    let results = [...allEntries];

    // Search filter
    if (debouncedQuery.trim() && indexReady) {
      const hits = searchIndex(debouncedQuery);
      const journalHitIds = new Set(
        hits
          .filter((h) => h.entityType === "journal")
          .map((h) => h.id),
      );
      results = results.filter((e) => journalHitIds.has(e.id));
    }

    // Activity type filter
    if (activityFilter) {
      results = results.filter((e) => e.activityType === activityFilter);
    }

    // Plant filter
    if (plantFilter) {
      results = results.filter(
        (e) => e.plantInstanceId === plantFilter,
      );
    }

    // Season filter
    if (effectiveSeasonFilter) {
      results = results.filter((e) => e.seasonId === effectiveSeasonFilter);
    }

    // Date range filter
    if (dateRange === "week") {
      const weekStart = startOfWeek(new Date());
      results = results.filter(
        (e) => new Date(e.createdAt) >= weekStart,
      );
    } else if (dateRange === "month") {
      const monthStart = startOfMonth(new Date());
      results = results.filter(
        (e) => new Date(e.createdAt) >= monthStart,
      );
    }

    return results;
  }, [
    allEntries,
    debouncedQuery,
    activityFilter,
    plantFilter,
    effectiveSeasonFilter,
    dateRange,
    indexReady,
  ]);

  // Row data for react-window (memoized to prevent re-renders)
  const handleSelect = useCallback((entry: JournalEntry) => {
    setSelectedEntry(entry);
  }, []);

  const rowData = useMemo<RowData>(
    () => ({
      entries: filteredEntries,
      plantNames,
      temperatureUnit: settings.temperatureUnit,
      onSelect: handleSelect,
    }),
    [filteredEntries, plantNames, settings.temperatureUnit, handleSelect],
  );

  // Loading state
  if (allEntries === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-4" role="status" aria-label="Journal wird geladen">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="mt-4 h-10 w-full" />
        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[92px] w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold text-text-heading">
            Journal
          </h1>
          <span className="text-sm text-text-secondary">
            {allEntries.length}{" "}
            {allEntries.length === 1 ? "Eintrag" : "Eintraege"}
          </span>
        </div>

        {/* Search bar */}
        <div className="mt-4">
          <Input
            type="search"
            placeholder="Journal durchsuchen..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Journal durchsuchen"
          />
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Season filter */}
          <select
            value={effectiveSeasonFilter}
            onChange={(e) => setSeasonFilter(e.target.value)}
            className={selectClass}
            aria-label="Nach Saison filtern"
          >
            <option value="">Alle Saisons</option>
            {allSeasons?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Plant filter */}
          <select
            value={plantFilter}
            onChange={(e) => setPlantFilter(e.target.value)}
            className={selectClass}
            aria-label="Nach Pflanze filtern"
          >
            <option value="">Alle Pflanzen</option>
            {allPlants?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname ?? p.species}
              </option>
            ))}
          </select>

          {/* Activity type filter */}
          <select
            value={activityFilter}
            onChange={(e) =>
              setActivityFilter(e.target.value as ActivityType | "")
            }
            className={selectClass}
            aria-label="Nach Aktivitaet filtern"
          >
            <option value="">Alle Aktivitaeten</option>
            {ALL_ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_LABELS[t]}
              </option>
            ))}
          </select>

          {/* Date range filter */}
          <div className="flex overflow-hidden rounded-lg border border-border-strong">
            {(["all", "week", "month"] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  dateRange === range
                    ? "bg-primary text-text-on-primary"
                    : "bg-surface text-text-secondary hover:bg-surface-muted"
                }`}
              >
                {range === "all"
                  ? "Alle"
                  : range === "week"
                    ? "Diese Woche"
                    : "Diesen Monat"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Feed */}
      {filteredEntries.length === 0 ? (
        <div className="mx-auto mt-12 max-w-3xl text-center">
          {allEntries.length === 0 ? (
            <>
              <ClipboardCheckIcon className="mx-auto h-16 w-16 text-text-muted" />
              <p className="mt-4 text-lg font-medium text-text-secondary">
                Noch keine Journaleintraege
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Starte unten mit dem + deinen ersten Eintrag.
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium text-text-secondary">
                Keine Eintraege passen zu deinen Filtern
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Passe Suche oder Filter an.
              </p>
            </>
          )}
        </div>
      ) : (
        filteredEntries.length >= VIRTUALIZE_THRESHOLD ? (
          <div ref={containerRef} className="mx-auto mt-3 w-full max-w-3xl flex-1">
            <FixedSizeList
              height={listHeight}
              width="100%"
              itemCount={filteredEntries.length}
              itemSize={ITEM_HEIGHT}
              itemData={rowData}
              overscanCount={5}
            >
              {EntryRow}
            </FixedSizeList>
          </div>
        ) : (
          <div className="mx-auto mt-3 w-full max-w-3xl pb-24">
            {filteredEntries.map((entry, index) => (
              <EntryRow
                key={entry.id}
                index={index}
                style={{}}
                data={rowData}
              />
            ))}
          </div>
        )
      )}

      {/* FAB */}
      <AddEntryFab />

      {/* Entry detail overlay */}
      {selectedEntry && (
        <EntryDetail
          entry={selectedEntry}
          plantName={
            selectedEntry.plantInstanceId
              ? plantNames.get(selectedEntry.plantInstanceId)
              : undefined
          }
          temperatureUnit={settings.temperatureUnit}
          onClose={() => setSelectedEntry(null)}
          onEdit={() => {
            const id = selectedEntry.id;
            setSelectedEntry(null);
            void navigate(`/journal/${id}/edit`);
          }}
          onDelete={() => void handleDeleteEntry(selectedEntry)}
        />
      )}
    </div>
  );
}
