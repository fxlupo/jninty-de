import { useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { usePouchQuery } from "../hooks/usePouchQuery.ts";
import { userPlantKnowledgeRepository } from "../db/index.ts";
import {
  loadAllKnowledgeItems,
  groupBySpecies,
} from "../services/knowledgeBase";
import { SUN_LABELS, WATER_LABELS } from "../constants/knowledgeLabels";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import { ChevronLeftIcon } from "../components/icons";
import Skeleton from "../components/ui/Skeleton";

export default function KnowledgeSpeciesPage() {
  const { speciesSlug: slug } = useParams<{ speciesSlug: string }>();
  const navigate = useNavigate();

  const userEntries = usePouchQuery(() =>
    userPlantKnowledgeRepository.getAll(),
  );

  const allItems = useMemo(
    () => loadAllKnowledgeItems(userEntries ?? []),
    [userEntries],
  );

  const group = useMemo(() => {
    if (!slug) return undefined;
    const groups = groupBySpecies(allItems);
    return groups.find((g) => g.speciesSlug === slug) ?? null;
  }, [allItems, slug]);

  // Loading
  if (userEntries === undefined || group === undefined) {
    return (
      <div className="mx-auto max-w-3xl p-4" role="status" aria-label="Art wird geladen">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="mt-2 h-5 w-1/2" />
        <Skeleton className="mt-6 h-32 w-full" />
        <Skeleton className="mt-4 h-24 w-full" />
      </div>
    );
  }

  // Not found
  if (group === null) {
    return (
      <div className="p-4 text-center">
        <p className="text-lg font-medium text-text-secondary">
          Art nicht gefunden
        </p>
        <Link
          to="/knowledge"
          className="mt-2 inline-block text-sm text-text-heading hover:underline"
        >
          Zurueck zur Wissensbasis
        </Link>
      </div>
    );
  }

  // Use first entry for shared species-level data
  const representative = group.entries[0]!.data;

  return (
    <div className="mx-auto max-w-3xl pb-8">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
            aria-label="Zurueck"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold text-text-primary">
              {group.commonName}
            </h1>
            <p className="mt-0.5 text-text-secondary italic">
              {group.species}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {group.family && <Badge variant="default">{group.family}</Badge>}
          <Badge variant="success">
            {group.entries.length} {group.entries.length === 1 ? "Sorte" : "Sorten"}
          </Badge>
          {representative.isPerennial && <Badge variant="default">Mehrjaehrig</Badge>}
        </div>
      </div>

      <div className="space-y-4 px-4">
        {/* Shared growing info */}
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-heading">
            Anbauinfos
          </h2>
          <dl className="mt-3 space-y-2">
            <div className="flex justify-between">
              <dt className="text-sm text-text-secondary">Sonne</dt>
              <dd className="text-sm font-medium text-text-primary">
                {SUN_LABELS[representative.sunNeeds]}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-text-secondary">Wasser</dt>
              <dd className="text-sm font-medium text-text-primary">
                {WATER_LABELS[representative.waterNeeds]}
              </dd>
            </div>
            {representative.soilPreference && (
              <div className="flex justify-between">
                <dt className="text-sm text-text-secondary">Boden</dt>
                <dd className="text-sm font-medium text-text-primary">
                  {representative.soilPreference}
                </dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Shared companions */}
        {((representative.goodCompanions && representative.goodCompanions.length > 0) ||
          (representative.badCompanions && representative.badCompanions.length > 0)) && (
          <Card>
            <h2 className="font-display text-lg font-semibold text-text-heading">
              Mischkultur
            </h2>
            {representative.goodCompanions && representative.goodCompanions.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-text-secondary">Gute Nachbarn</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {representative.goodCompanions.map((c) => (
                    <Badge key={c} variant="success">{c}</Badge>
                  ))}
                </div>
              </div>
            )}
            {representative.badCompanions && representative.badCompanions.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-text-secondary">Schlechte Nachbarn</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {representative.badCompanions.map((c) => (
                    <Badge key={c} variant="danger">{c}</Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Shared pests & diseases */}
        {((representative.commonPests && representative.commonPests.length > 0) ||
          (representative.commonDiseases && representative.commonDiseases.length > 0)) && (
          <Card>
            <h2 className="font-display text-lg font-semibold text-text-heading">
              Haeufige Probleme
            </h2>
            {representative.commonPests && representative.commonPests.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-text-secondary">Schaedlinge</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {representative.commonPests.map((p) => (
                    <Badge key={p} variant="warning">{p}</Badge>
                  ))}
                </div>
              </div>
            )}
            {representative.commonDiseases && representative.commonDiseases.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-text-secondary">Krankheiten</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {representative.commonDiseases.map((d) => (
                    <Badge key={d} variant="danger">{d}</Badge>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Varieties grid */}
        <div>
          <h2 className="font-display text-lg font-semibold text-text-heading">
            Sorten
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.entries.map((item) => (
              <Link key={item.id} to={`/knowledge/${item.id}`}>
                <Card className="p-4 transition-shadow hover:shadow-md">
                  <p className="font-display font-semibold text-text-primary truncate">
                    {item.data.variety ?? item.data.commonName}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-text-secondary">
                    {item.data.daysToMaturity != null && (
                      <span>{item.data.daysToMaturity} Tage bis zur Reife</span>
                    )}
                    {item.data.spacingInches != null && (
                      <span>{item.data.spacingInches}" Abstand</span>
                    )}
                  </div>
                  {item.data.matureHeightInches != null && (
                    <p className="mt-1 text-xs text-text-secondary">
                      Hoehe: {item.data.matureHeightInches}" &middot; Breite: {item.data.matureSpreadInches ?? "-"}"
                    </p>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
