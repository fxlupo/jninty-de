import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { usePouchQuery } from "../hooks/usePouchQuery.ts";
import { userPlantKnowledgeRepository } from "../db/index.ts";
import { loadAllKnowledgeItems } from "../services/knowledgeBase";
import { PLANT_CATEGORIES } from "../constants/knowledgeCategories.ts";
import { TYPE_LABELS } from "../constants/plantLabels";
import { SUN_LABELS, WATER_LABELS } from "../constants/knowledgeLabels";
import { useDebounce } from "../hooks/useDebounce";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Input from "../components/ui/Input";
import { PlusIcon } from "../components/icons";
import Skeleton from "../components/ui/Skeleton";

// ─── Category Icons ───

function FlowerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M12 4a2.5 2.5 0 0 0 0 5" />
      <path d="M17.5 8a2.5 2.5 0 0 0-4.5 1" />
      <path d="M19 13.5a2.5 2.5 0 0 0-5-.5" />
      <path d="M16.5 19a2.5 2.5 0 0 0-1.5-4.5" />
      <path d="M12 21a2.5 2.5 0 0 0 0-5" />
      <path d="M6.5 19a2.5 2.5 0 0 0 2-4.5" />
      <path d="M5 13.5a2.5 2.5 0 0 0 5-.5" />
      <path d="M6.5 8a2.5 2.5 0 0 0 4.5 1" />
      <path d="M12 4a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

function OrnamentalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V12" />
      <path d="M12 12C12 7 8 4 4 5c0 4 3 7 8 7" />
      <path d="M12 12c0-5 4-8 8-7-1 4-4 7-8 7" />
      <path d="M5 21h14" />
    </svg>
  );
}

function ShrubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22v-6" />
      <path d="M8 16a4 4 0 0 1 8 0" />
      <path d="M6 12a6 6 0 0 1 12 0" />
      <path d="M4 8a8 8 0 0 1 16 0c0 .7-.1 1.4-.2 2" />
      <path d="M20 10c-.1.7-.2 1.4-.4 2" />
    </svg>
  );
}

function FruitTreeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22v-8" />
      <path d="M12 14C10 10 6 9 4 11c1 3 4 4 8 3" />
      <path d="M12 14c2-4 6-5 8-3-1 3-4 4-8 3" />
      <path d="M12 10C10 6 7 4 4 6c1 3 4 5 8 4" />
      <path d="M12 10c2-4 5-6 8-4-1 3-4 5-8 4" />
    </svg>
  );
}

function VegetableHerbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 20c3-3 7-3 12-8" />
      <path d="M18 12c-3 0-6 1-8 3" />
      <path d="M6 20c0-5 2-8 6-10" />
      <path d="M12 10c-2-3-1-7 2-8" />
    </svg>
  );
}

function OtherIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

const CATEGORY_ICONS: Record<string, (props: { className?: string }) => JSX.Element> = {
  blumen: FlowerIcon,
  zierpflanzen: OrnamentalIcon,
  straeucher: ShrubIcon,
  obstbaum: FruitTreeIcon,
  "gemuese-kraeuter": VegetableHerbIcon,
  sonstiges: OtherIcon,
};

export default function KnowledgeHubPage() {
  const userEntries = usePouchQuery(() =>
    userPlantKnowledgeRepository.getAll(),
  );

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);

  const allItems = useMemo(
    () => loadAllKnowledgeItems(userEntries ?? []),
    [userEntries],
  );

  // Search results (only when searching)
  const searchResults = useMemo(() => {
    if (!debouncedQuery.trim()) return null;
    const q = debouncedQuery.toLowerCase();
    return allItems.filter(
      (item) =>
        item.data.commonName.toLowerCase().includes(q) ||
        item.data.species.toLowerCase().includes(q) ||
        (item.data.variety && item.data.variety.toLowerCase().includes(q)),
    );
  }, [allItems, debouncedQuery]);

  if (userEntries === undefined) {
    return (
      <div className="mx-auto max-w-5xl p-4" role="status" aria-label="Wissensbasis wird geladen">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-4 h-10 w-full" />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border-default bg-surface-elevated p-6">
              <Skeleton className="mx-auto h-10 w-10 rounded-full" />
              <Skeleton className="mx-auto mt-3 h-5 w-20" />
              <Skeleton className="mx-auto mt-1 h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-text-heading">
          Wissensbasis
        </h1>
        <span className="text-sm text-text-secondary">
          {allItems.length} {allItems.length === 1 ? "Eintrag" : "Einträge"}
        </span>
      </div>

      {/* Search bar */}
      <div className="mt-4">
        <Input
          type="search"
          placeholder="Nach Name, Art oder Sorte suchen..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Wissensbasis durchsuchen"
        />
      </div>

      {/* Search results mode */}
      {searchResults !== null ? (
        searchResults.length === 0 ? (
          <div className="mt-12 text-center">
            <p className="text-lg font-medium text-text-secondary">
              Keine Einträge passen zur Suche
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              Versuche einen anderen Suchbegriff.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {searchResults.map((item) => (
              <Link key={item.id} to={`/knowledge/${item.id}`}>
                <Card className="p-4 transition-shadow hover:shadow-md">
                  <p className="font-display font-semibold text-text-primary truncate">
                    {item.data.commonName}
                  </p>
                  <p className="mt-0.5 text-sm text-text-secondary truncate italic">
                    {item.data.species}
                    {item.data.variety ? ` '${item.data.variety}'` : ""}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-text-secondary">
                    <span>{SUN_LABELS[item.data.sunNeeds]}</span>
                    <span>&middot;</span>
                    <span>Wasserbedarf: {WATER_LABELS[item.data.waterNeeds]}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge>{TYPE_LABELS[item.data.plantType]}</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )
      ) : (
        /* Category cards mode */
        <>
          {allItems.length === 0 && (
            <div className="mt-10 rounded-xl border border-dashed border-border-strong p-8 text-center">
              <p className="text-base font-medium text-text-secondary">
                Noch keine Einträge vorhanden
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                Lege deinen ersten Wissenseintrag über das Plus-Symbol an.
              </p>
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {PLANT_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat.slug];
              const count = allItems.filter((item) =>
                cat.plantTypes.includes(item.data.plantType),
              ).length;
              return (
                <Link key={cat.slug} to={`/knowledge/plants/${cat.slug}`}>
                  <Card className="flex flex-col items-center px-4 py-8 text-center transition-shadow hover:shadow-md">
                    {Icon && <Icon className="h-12 w-12 text-primary" />}
                    <p className="mt-3 font-display text-lg font-semibold text-text-primary">
                      {cat.label}
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {count} {count === 1 ? "Eintrag" : "Einträge"}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {/* Floating add button */}
      <Link
        to="/knowledge/new"
        aria-label="Wissenseintrag hinzufügen"
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-text-on-primary shadow-lg transition-transform hover:bg-primary-hover active:scale-95 md:bottom-6"
      >
        <PlusIcon className="h-7 w-7" />
      </Link>
    </div>
  );
}
