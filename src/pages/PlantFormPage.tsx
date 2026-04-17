import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ZodError } from "zod";
import { plantRepository, photoRepository, userPlantKnowledgeRepository } from "../db/index.ts";
import { addToIndex, serializeIndex } from "../db/search";
import type { UserPlantKnowledge } from "../validation/userPlantKnowledge.schema.ts";
import { usePhotoCapture } from "../hooks/usePhotoCapture";
import { useSettings } from "../hooks/useSettings";
import { usePlantPhotoManager } from "../hooks/usePlantPhotoManager";
import type { PlantType, PlantSource, PlantStatus } from "../types";
import {
  TYPE_OPTIONS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
} from "../constants/plantLabels";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import StoreAutosuggest from "../components/StoreAutosuggest";
import PlantPhotoManager from "../components/plant/PlantPhotoManager";
import { ChevronLeftIcon } from "../components/icons";
import Skeleton from "../components/ui/Skeleton";

// ─── Select style ───

const selectClass =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25";

// ─── Field label map for user-friendly Zod error messages ───

const FIELD_LABELS: Record<string, string> = {
  species: "Art",
  nickname: "Spitzname",
  variety: "Sorte",
  type: "Typ",
  isPerennial: "Mehrjaehrig",
  source: "Quelle",
  status: "Status",
  dateAcquired: "Kaufdatum",
  careNotes: "Pflegenotizen",
  tags: "Schlagwoerter",
  photoIds: "Fotos",
};

// ─── Component ───

export default function PlantFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = !!id;

  // Form state
  const [nickname, setNickname] = useState("");
  const [species, setSpecies] = useState("");
  const [variety, setVariety] = useState("");
  const [type, setType] = useState<PlantType>("vegetable");
  const [isPerennial, setIsPerennial] = useState(false);
  const [source, setSource] = useState<PlantSource>("unknown");
  const [status, setStatus] = useState<PlantStatus>("active");
  const [dateAcquired, setDateAcquired] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseStore, setPurchaseStore] = useState("");
  const [careNotes, setCareNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [knowledgeId, setKnowledgeId] = useState<string>("");
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [knowledgeEntries, setKnowledgeEntries] = useState<UserPlantKnowledge[]>([]);
  const [showKnowledgeDrop, setShowKnowledgeDrop] = useState(false);
  const knowledgeDropRef = useRef<HTMLDivElement>(null);

  const { settings } = useSettings();
  const { capturePhoto, selectPhoto, isProcessing, error: photoError } =
    usePhotoCapture({ keepOriginals: settings.keepOriginalPhotos });
  const photoManager = usePlantPhotoManager();

  // Submission state
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(isEditing);

  // Load existing plant data for edit mode
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    void (async () => {
      const plant = await plantRepository.getById(id);
      if (cancelled || !plant) {
        if (!plant && !cancelled) void navigate("/plants", { replace: true });
        return;
      }

      setNickname(plant.nickname ?? "");
      setSpecies(plant.species);
      setVariety(plant.variety ?? "");
      setType(plant.type);
      setIsPerennial(plant.isPerennial);
      setSource(plant.source);
      setStatus(plant.status);
      setDateAcquired(plant.dateAcquired ?? "");
      setPurchasePrice(plant.purchasePrice != null ? String(plant.purchasePrice) : "");
      setPurchaseStore(plant.purchaseStore ?? "");
      setCareNotes(plant.careNotes ?? "");
      setTagsInput(plant.tags.join(", "));
      if (plant.knowledgeId) {
        setKnowledgeId(plant.knowledgeId);
      }

      // Load all photos, then replace state atomically to prevent duplicates
      // when the effect is re-invoked (e.g. React StrictMode double-mount).
      const entries: Array<{ id: string; previewUrl: string; takenAt?: string }> = [];
      for (const photoId of plant.photoIds ?? []) {
        if (cancelled) break;
        const photo = await photoRepository.getById(photoId);
        if (photo) {
          entries.push({
            id: photoId,
            previewUrl: photo.thumbnailUrl,
            ...(photo.takenAt != null ? { takenAt: photo.takenAt } : {}),
          });
        }
      }

      if (cancelled) {
        // Cleanup URLs that were never handed to the manager
        for (const e of entries) URL.revokeObjectURL(e.previewUrl);
        return;
      }

      photoManager.loadExisting(entries);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  // Load knowledge entries for the picker
  useEffect(() => {
    void userPlantKnowledgeRepository.getAll().then(setKnowledgeEntries);
  }, []);

  // Close knowledge dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (knowledgeDropRef.current && !knowledgeDropRef.current.contains(e.target as Node)) {
        setShowKnowledgeDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ─── Photo handlers ───

  const handleCapturePhoto = async () => {
    try {
      const photo = await capturePhoto();
      photoManager.addNew(photo);
    } catch {
      // error handled by usePhotoCapture
    }
  };

  const handleSelectPhoto = async () => {
    try {
      const photo = await selectPhoto();
      photoManager.addNew(photo);
    } catch {
      // error handled by usePhotoCapture
    }
  };

  // ─── Submit ───

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    // Basic validation
    if (!species.trim()) {
      setErrors(["Die Art ist erforderlich."]);
      return;
    }

    setSaving(true);

    try {
      // Save photos
      const savedPhotoIds = await photoManager.saveAll();
      const photoIds: string[] | undefined =
        savedPhotoIds.length > 0 ? savedPhotoIds : undefined;

      // Parse tags
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      // Build the plant input
      const input: Parameters<typeof plantRepository.create>[0] = {
        species: species.trim(),
        type,
        isPerennial,
        source,
        status,
        tags,
      };

      // Only set optional fields if they have values
      const trimmedNickname = nickname.trim();
      if (trimmedNickname) input.nickname = trimmedNickname;

      const trimmedVariety = variety.trim();
      if (trimmedVariety) input.variety = trimmedVariety;

      if (dateAcquired) input.dateAcquired = dateAcquired;

      const priceNum = Number(purchasePrice);
      if (purchasePrice && !Number.isNaN(priceNum)) {
        input.purchasePrice = priceNum;
      }

      const trimmedStore = purchaseStore.trim();
      if (trimmedStore) input.purchaseStore = trimmedStore;

      const trimmedNotes = careNotes.trim();
      if (trimmedNotes) input.careNotes = trimmedNotes;

      if (photoIds) input.photoIds = photoIds;

      if (knowledgeId) input.knowledgeId = knowledgeId;

      let plant;
      if (isEditing && id) {
        plant = await plantRepository.update(id, input);
      } else {
        plant = await plantRepository.create(input);
      }

      // Update search index
      addToIndex(plant, "plant");
      void serializeIndex();

      void navigate(`/plants/${plant.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ZodError) {
        setErrors(
          err.issues.map((issue) => {
            const field = issue.path[0];
            const label =
              typeof field === "string"
                ? (FIELD_LABELS[field] ?? field)
                : "Feld";
            return `${label}: ${issue.message}`;
          }),
        );
      } else {
        const message =
          err instanceof Error ? err.message : "Pflanze konnte nicht gespeichert werden.";
        setErrors([message]);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-4" role="status" aria-label="Formular wird geladen">
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const backPath = isEditing && id ? `/plants/${id}` : "/plants";

  return (
    <div className="mx-auto max-w-2xl p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void navigate(backPath)}
          className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
          aria-label="Zurueck"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="font-display text-2xl font-bold text-text-heading">
          {isEditing ? "Pflanze bearbeiten" : "Pflanze hinzufuegen"}
        </h1>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-6">
        {/* Photo section */}
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-heading">
            Fotos
          </h2>
          <div className="mt-3">
            <PlantPhotoManager
              photos={photoManager.photos}
              onRemove={photoManager.remove}
              onSetCover={photoManager.setCover}
              onUpdateTakenAt={photoManager.updateTakenAt}
              onCapturePhoto={handleCapturePhoto}
              onSelectPhoto={handleSelectPhoto}
              isProcessing={isProcessing}
              error={photoError}
              saving={photoManager.saving}
              uploadProgress={photoManager.uploadProgress}
              uploadErrors={photoManager.uploadErrors}
            />
          </div>
        </Card>

        {/* Plant information */}
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-heading">
            Pflanzeninformationen
          </h2>

          <div className="mt-4 space-y-4">
            {/* Species (required) */}
            <div>
              <label
                htmlFor="species"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Art <span className="text-terracotta-500">*</span>
              </label>
              <Input
                id="species"
                type="text"
                placeholder="z. B. Solanum lycopersicum"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
              />
            </div>

            {/* Nickname */}
            <div>
              <label
                htmlFor="nickname"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Spitzname
              </label>
              <Input
                id="nickname"
                type="text"
                placeholder="z. B. Apfelbaum hinten im Garten"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </div>

            {/* Variety */}
            <div>
              <label
                htmlFor="variety"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Sorte
              </label>
              <Input
                id="variety"
                type="text"
                placeholder="z. B. Honeycrisp"
                value={variety}
                onChange={(e) => setVariety(e.target.value)}
              />
            </div>

            {/* Type */}
            <div>
              <label
                htmlFor="plant-type"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Typ
              </label>
              <select
                id="plant-type"
                value={type}
                onChange={(e) => setType(e.target.value as PlantType)}
                className={selectClass}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Perennial toggle */}
            <div className="flex items-center gap-3">
              <label htmlFor="is-perennial" className="text-sm font-medium text-text-secondary">
                Mehrjaehrig
              </label>
              <button
                type="button"
                id="is-perennial"
                role="switch"
                aria-checked={isPerennial}
                onClick={() => setIsPerennial(!isPerennial)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                  isPerennial ? "bg-green-600" : "bg-border-strong"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    isPerennial ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Source */}
            <div>
              <label
                htmlFor="source"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Quelle
              </label>
              <select
                id="source"
                value={source}
                onChange={(e) => setSource(e.target.value as PlantSource)}
                className={selectClass}
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label
                htmlFor="status"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Status
              </label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as PlantStatus)}
                className={selectClass}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date acquired */}
            <div>
              <label
                htmlFor="date-acquired"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Kaufdatum
              </label>
              <Input
                id="date-acquired"
                type="date"
                value={dateAcquired}
                onChange={(e) => setDateAcquired(e.target.value)}
              />
            </div>

            {/* Purchase price */}
            <div>
              <label
                htmlFor="purchase-price"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Kaufpreis (€)
              </label>
              <Input
                id="purchase-price"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
              />
            </div>

            {/* Purchased at */}
            <div>
              <label
                htmlFor="purchase-store"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Gekauft bei
              </label>
              <StoreAutosuggest
                id="purchase-store"
                value={purchaseStore}
                onChange={setPurchaseStore}
              />
            </div>

            {/* Tags */}
            <div>
              <label
                htmlFor="tags"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Schlagwoerter
              </label>
              <Input
                id="tags"
                type="text"
                placeholder="z. B. Hochbeet, samenfest, bio"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
              />
              <p className="mt-1 text-xs text-text-secondary">
                Mit Kommas trennen
              </p>
            </div>

            {/* Care notes */}
            <div>
              <label
                htmlFor="care-notes"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Pflegenotizen
              </label>
              <textarea
                id="care-notes"
                rows={3}
                placeholder="Notizen zur Pflege dieser Pflanze..."
                value={careNotes}
                onChange={(e) => setCareNotes(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25"
              />
            </div>

            {/* Knowledge link */}
            <div ref={knowledgeDropRef} className="relative">
              <label className="mb-1 block text-sm font-medium text-text-secondary">
                Verknüpfter Wissenseintrag
              </label>
              {knowledgeId ? (
                <div className="flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2">
                  <span className="flex-1 truncate text-sm text-text-primary">
                    {(() => {
                      const entry = knowledgeEntries.find((e) => e.id === knowledgeId);
                      return entry ? `${entry.commonName}${entry.variety ? ` – ${entry.variety}` : ""}` : knowledgeId;
                    })()}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setKnowledgeId(""); setKnowledgeSearch(""); }}
                    className="shrink-0 text-text-muted hover:text-terracotta-600 transition-colors"
                    aria-label="Verknüpfung entfernen"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Wissenseintrag suchen..."
                    value={knowledgeSearch}
                    onChange={(e) => { setKnowledgeSearch(e.target.value); setShowKnowledgeDrop(true); }}
                    onFocus={() => setShowKnowledgeDrop(true)}
                    className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25"
                  />
                  {showKnowledgeDrop && (
                    <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-border-default bg-surface-elevated shadow-lg">
                      {knowledgeEntries
                        .filter((e) => {
                          if (!knowledgeSearch.trim()) return true;
                          const q = knowledgeSearch.toLowerCase();
                          return (
                            e.commonName.toLowerCase().includes(q) ||
                            e.species.toLowerCase().includes(q) ||
                            (e.variety?.toLowerCase().includes(q) ?? false)
                          );
                        })
                        .slice(0, 30)
                        .map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setKnowledgeId(entry.id);
                              setKnowledgeSearch("");
                              setShowKnowledgeDrop(false);
                            }}
                            className="flex w-full flex-col px-3 py-2 text-left hover:bg-surface transition-colors"
                          >
                            <span className="text-sm font-medium text-text-primary">
                              {entry.commonName}
                              {entry.variety && <span className="text-text-muted"> – {entry.variety}</span>}
                            </span>
                            <span className="text-xs text-text-muted italic">{entry.species}</span>
                          </button>
                        ))}
                      {knowledgeEntries.length === 0 && (
                        <p className="px-3 py-2 text-sm text-text-muted">Keine Wissenseinträge vorhanden</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </Card>

        {/* Error display */}
        {errors.length > 0 && (
          <div className="rounded-lg bg-terracotta-400/10 p-3">
            {errors.map((err, i) => (
              <p key={i} className="text-sm text-terracotta-600">
                {err}
              </p>
            ))}
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving
              ? "Speichert..."
              : isEditing
                ? "Aenderungen speichern"
                : "Pflanze hinzufuegen"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => void navigate(backPath)}
          >
            Abbrechen
          </Button>
        </div>
      </form>
    </div>
  );
}
