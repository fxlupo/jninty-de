import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ZodError } from "zod";
import { userPlantKnowledgeRepository } from "../db/index.ts";
import type { PlantType, SunExposure, WaterNeeds, GrowthRate } from "../types";
import { TYPE_OPTIONS } from "../constants/plantLabels";
import {
  SUN_OPTIONS,
  WATER_OPTIONS,
  GROWTH_RATE_OPTIONS,
} from "../constants/knowledgeLabels";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import { ChevronLeftIcon } from "../components/icons";
import Skeleton from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";

// ─── Select style ───

const selectClass =
  "w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25";

// ─── Field label map ───

const FIELD_LABELS: Record<string, string> = {
  species: "Artname",
  commonName: "Trivialname",
  variety: "Sorte",
  plantType: "Pflanzentyp",
  isPerennial: "Mehrjaehrig",
  sunNeeds: "Sonnenbedarf",
  waterNeeds: "Wasserbedarf",
  soilPreference: "Boden",
  growthRate: "Wachstum",
  spacingInches: "Abstand",
  matureHeightInches: "Hoehe",
  matureSpreadInches: "Breite",
};

// ─── Component ───

export default function KnowledgeFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = !!id;

  // Redirect if trying to edit a built-in entry
  useEffect(() => {
    if (id && id.startsWith("builtin-")) {
      void navigate("/knowledge", { replace: true });
    }
  }, [id, navigate]);

  // Form state
  const [species, setSpecies] = useState("");
  const [commonName, setCommonName] = useState("");
  const [variety, setVariety] = useState("");
  const [plantType, setPlantType] = useState<PlantType>("vegetable");
  const [isPerennial, setIsPerennial] = useState(false);
  const [sunNeeds, setSunNeeds] = useState<SunExposure>("full_sun");
  const [waterNeeds, setWaterNeeds] = useState<WaterNeeds>("moderate");
  const [soilPreference, setSoilPreference] = useState("");
  const [growthRate, setGrowthRate] = useState<GrowthRate | "">("");
  const [spacingInches, setSpacingInches] = useState("");
  const [matureHeightInches, setMatureHeightInches] = useState("");
  const [matureSpreadInches, setMatureSpreadInches] = useState("");

  // Planting timing
  const [indoorStart, setIndoorStart] = useState("");
  const [transplant, setTransplant] = useState("");
  const [directSowBefore, setDirectSowBefore] = useState("");
  const [directSowAfter, setDirectSowAfter] = useState("");
  const [germination, setGermination] = useState("");
  const [maturity, setMaturity] = useState("");

  // Companions & issues (comma-separated)
  const [goodCompanions, setGoodCompanions] = useState("");
  const [badCompanions, setBadCompanions] = useState("");
  const [commonPests, setCommonPests] = useState("");
  const [commonDiseases, setCommonDiseases] = useState("");

  // Submission state
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(isEditing);

  // Load existing data for edit
  useEffect(() => {
    if (!id || id.startsWith("builtin-")) return;

    void (async () => {
      const entry = await userPlantKnowledgeRepository.getById(id);
      if (!entry) {
        void navigate("/knowledge", { replace: true });
        return;
      }

      setSpecies(entry.species);
      setCommonName(entry.commonName);
      setVariety(entry.variety ?? "");
      setPlantType(entry.plantType);
      setIsPerennial(entry.isPerennial);
      setSunNeeds(entry.sunNeeds);
      setWaterNeeds(entry.waterNeeds);
      setSoilPreference(entry.soilPreference ?? "");
      setGrowthRate(entry.growthRate ?? "");
      setSpacingInches(
        entry.spacingInches != null ? String(entry.spacingInches) : "",
      );
      setMatureHeightInches(
        entry.matureHeightInches != null
          ? String(entry.matureHeightInches)
          : "",
      );
      setMatureSpreadInches(
        entry.matureSpreadInches != null
          ? String(entry.matureSpreadInches)
          : "",
      );
      setIndoorStart(
        entry.indoorStartWeeksBeforeLastFrost != null
          ? String(entry.indoorStartWeeksBeforeLastFrost)
          : "",
      );
      setTransplant(
        entry.transplantWeeksAfterLastFrost != null
          ? String(entry.transplantWeeksAfterLastFrost)
          : "",
      );
      setDirectSowBefore(
        entry.directSowWeeksBeforeLastFrost != null
          ? String(entry.directSowWeeksBeforeLastFrost)
          : "",
      );
      setDirectSowAfter(
        entry.directSowWeeksAfterLastFrost != null
          ? String(entry.directSowWeeksAfterLastFrost)
          : "",
      );
      setGermination(
        entry.daysToGermination != null
          ? String(entry.daysToGermination)
          : "",
      );
      setMaturity(
        entry.daysToMaturity != null ? String(entry.daysToMaturity) : "",
      );
      setGoodCompanions(entry.goodCompanions?.join(", ") ?? "");
      setBadCompanions(entry.badCompanions?.join(", ") ?? "");
      setCommonPests(entry.commonPests?.join(", ") ?? "");
      setCommonDiseases(entry.commonDiseases?.join(", ") ?? "");

      setLoading(false);
    })();
  }, [id, navigate]);

  // ─── Submit ───

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    if (!species.trim() || !commonName.trim()) {
      setErrors(["Artname und Trivialname sind erforderlich."]);
      return;
    }

    setSaving(true);

    try {
      // Parse comma-separated arrays
      const parseList = (s: string) =>
        s
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length > 0);

      const parseOptionalInt = (s: string) => {
        if (!s.trim()) return undefined;
        const n = Number(s);
        return Number.isNaN(n) ? undefined : Math.round(n);
      };

      // Build input, only including optional fields when they have values
      // (to satisfy exactOptionalPropertyTypes)
      // Derive cropGroup from commonName (slugified)
      const cropGroup = commonName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

      const input: Parameters<typeof userPlantKnowledgeRepository.create>[0] = {
        species: species.trim(),
        commonName: commonName.trim(),
        plantType,
        isPerennial,
        cropGroup,
        sunNeeds,
        waterNeeds,
      };

      const trimmedVariety = variety.trim();
      if (trimmedVariety) input.variety = trimmedVariety;

      const trimmedSoil = soilPreference.trim();
      if (trimmedSoil) input.soilPreference = trimmedSoil;

      if (growthRate) input.growthRate = growthRate;

      const spacingNum = parseOptionalInt(spacingInches);
      if (spacingNum != null) input.spacingInches = spacingNum;

      const heightNum = parseOptionalInt(matureHeightInches);
      if (heightNum != null) input.matureHeightInches = heightNum;

      const spreadNum = parseOptionalInt(matureSpreadInches);
      if (spreadNum != null) input.matureSpreadInches = spreadNum;

      const indoorNum = parseOptionalInt(indoorStart);
      if (indoorNum != null) input.indoorStartWeeksBeforeLastFrost = indoorNum;

      const transplantNum = parseOptionalInt(transplant);
      if (transplantNum != null)
        input.transplantWeeksAfterLastFrost = transplantNum;

      const sowBeforeNum = parseOptionalInt(directSowBefore);
      if (sowBeforeNum != null)
        input.directSowWeeksBeforeLastFrost = sowBeforeNum;

      const sowAfterNum = parseOptionalInt(directSowAfter);
      if (sowAfterNum != null)
        input.directSowWeeksAfterLastFrost = sowAfterNum;

      const germNum = parseOptionalInt(germination);
      if (germNum != null) input.daysToGermination = germNum;

      const matNum = parseOptionalInt(maturity);
      if (matNum != null) input.daysToMaturity = matNum;

      const goodList = parseList(goodCompanions);
      if (goodList.length > 0) input.goodCompanions = goodList;

      const badList = parseList(badCompanions);
      if (badList.length > 0) input.badCompanions = badList;

      const pestList = parseList(commonPests);
      if (pestList.length > 0) input.commonPests = pestList;

      const diseaseList = parseList(commonDiseases);
      if (diseaseList.length > 0) input.commonDiseases = diseaseList;

      let entry;
      if (isEditing && id) {
        entry = await userPlantKnowledgeRepository.update(id, input, {
          replaceAll: true,
        });
      } else {
        entry = await userPlantKnowledgeRepository.create(input);
      }

      toast(isEditing ? "Eintrag aktualisiert" : "Eintrag erstellt", "success");
      void navigate(`/knowledge/${entry.id}`, { replace: true });
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
          err instanceof Error ? err.message : "Eintrag konnte nicht gespeichert werden.";
        setErrors([message]);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className="mx-auto max-w-2xl p-4"
        role="status"
        aria-label="Formular wird geladen"
      >
        <Skeleton className="h-8 w-40" />
        <div className="mt-6 space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const backPath = isEditing && id ? `/knowledge/${id}` : "/knowledge";

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
          {isEditing ? "Wissenseintrag bearbeiten" : "Wissenseintrag hinzufuegen"}
        </h1>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-6">
        {/* Basic Info */}
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-heading">
            Grunddaten
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="species"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Artname <span className="text-terracotta-500">*</span>
              </label>
              <Input
                id="species"
                type="text"
                placeholder="z. B. Solanum lycopersicum"
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="commonName"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Trivialname <span className="text-terracotta-500">*</span>
              </label>
              <Input
                id="commonName"
                type="text"
                placeholder="z. B. Tomate"
                value={commonName}
                onChange={(e) => setCommonName(e.target.value)}
              />
            </div>
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
                placeholder="z. B. Roma"
                value={variety}
                onChange={(e) => setVariety(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="plantType"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Pflanzentyp <span className="text-terracotta-500">*</span>
              </label>
              <select
                id="plantType"
                value={plantType}
                onChange={(e) => setPlantType(e.target.value as PlantType)}
                className={selectClass}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label
                htmlFor="isPerennial"
                className="text-sm font-medium text-text-secondary"
              >
                Mehrjaehrig <span className="text-terracotta-500">*</span>
              </label>
              <button
                type="button"
                id="isPerennial"
                role="switch"
                aria-checked={isPerennial}
                onClick={() => setIsPerennial(!isPerennial)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                  isPerennial ? "bg-green-600" : "bg-brown-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                    isPerennial ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </Card>

        {/* Care Requirements */}
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-heading">
            Pflegebedarf
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="sunNeeds"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Sonnenbedarf <span className="text-terracotta-500">*</span>
              </label>
              <select
                id="sunNeeds"
                value={sunNeeds}
                onChange={(e) => setSunNeeds(e.target.value as SunExposure)}
                className={selectClass}
              >
                {SUN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="waterNeeds"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Wasserbedarf <span className="text-terracotta-500">*</span>
              </label>
              <select
                id="waterNeeds"
                value={waterNeeds}
                onChange={(e) => setWaterNeeds(e.target.value as WaterNeeds)}
                className={selectClass}
              >
                {WATER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="soilPreference"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Boden
              </label>
              <Input
                id="soilPreference"
                type="text"
                placeholder="z. B. durchlaessig, lehmig"
                value={soilPreference}
                onChange={(e) => setSoilPreference(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="growthRate"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Wachstum
              </label>
              <select
                id="growthRate"
                value={growthRate}
                onChange={(e) =>
                  setGrowthRate(e.target.value as GrowthRate | "")
                }
                className={selectClass}
              >
                <option value="">Nicht angegeben</option>
                {GROWTH_RATE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label
                  htmlFor="spacingInches"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Abstand (Zoll)
                </label>
                <Input
                  id="spacingInches"
                  type="number"
                  min="1"
                  placeholder="12"
                  value={spacingInches}
                  onChange={(e) => setSpacingInches(e.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="heightInches"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Hoehe (Zoll)
                </label>
                <Input
                  id="heightInches"
                  type="number"
                  min="1"
                  placeholder="36"
                  value={matureHeightInches}
                  onChange={(e) => setMatureHeightInches(e.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="spreadInches"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Breite (Zoll)
                </label>
                <Input
                  id="spreadInches"
                  type="number"
                  min="1"
                  placeholder="24"
                  value={matureSpreadInches}
                  onChange={(e) => setMatureSpreadInches(e.target.value)}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Planting Timing */}
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-heading">
            Pflanzzeitpunkte
          </h2>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="indoorStart"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Vorkultur (Wochen vor Frost)
                </label>
                <Input
                  id="indoorStart"
                  type="number"
                  placeholder="6"
                  value={indoorStart}
                  onChange={(e) => setIndoorStart(e.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="transplant"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Auspflanzen (Wochen nach Frost)
                </label>
                <Input
                  id="transplant"
                  type="number"
                  placeholder="2"
                  value={transplant}
                  onChange={(e) => setTransplant(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="directSowBefore"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Direktsaat (Wochen vor Frost)
                </label>
                <Input
                  id="directSowBefore"
                  type="number"
                  placeholder="4"
                  value={directSowBefore}
                  onChange={(e) => setDirectSowBefore(e.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="directSowAfter"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Direktsaat (Wochen nach Frost)
                </label>
                <Input
                  id="directSowAfter"
                  type="number"
                  placeholder="2"
                  value={directSowAfter}
                  onChange={(e) => setDirectSowAfter(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="germination"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Tage bis zur Keimung
                </label>
                <Input
                  id="germination"
                  type="number"
                  min="1"
                  placeholder="7"
                  value={germination}
                  onChange={(e) => setGermination(e.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="maturity"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Tage bis zur Reife
                </label>
                <Input
                  id="maturity"
                  type="number"
                  min="1"
                  placeholder="75"
                  value={maturity}
                  onChange={(e) => setMaturity(e.target.value)}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Companions & Issues */}
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-heading">
            Nachbarn und Probleme
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="goodCompanions"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Gute Nachbarn
              </label>
              <Input
                id="goodCompanions"
                type="text"
                placeholder="z. B. Basilikum, Moehren, Tagetes"
                value={goodCompanions}
                onChange={(e) => setGoodCompanions(e.target.value)}
              />
              <p className="mt-1 text-xs text-text-secondary">
                Mit Kommas trennen
              </p>
            </div>
            <div>
              <label
                htmlFor="badCompanions"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Schlechte Nachbarn
              </label>
              <Input
                id="badCompanions"
                type="text"
                placeholder="z. B. Fenchel, Kohl"
                value={badCompanions}
                onChange={(e) => setBadCompanions(e.target.value)}
              />
              <p className="mt-1 text-xs text-text-secondary">
                Mit Kommas trennen
              </p>
            </div>
            <div>
              <label
                htmlFor="commonPests"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Haeufige Schaedlinge
              </label>
              <Input
                id="commonPests"
                type="text"
                placeholder="z. B. Blattlaeuse, Raupen"
                value={commonPests}
                onChange={(e) => setCommonPests(e.target.value)}
              />
              <p className="mt-1 text-xs text-text-secondary">
                Mit Kommas trennen
              </p>
            </div>
            <div>
              <label
                htmlFor="commonDiseases"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Haeufige Krankheiten
              </label>
              <Input
                id="commonDiseases"
                type="text"
                placeholder="z. B. Krautfaeule, Echter Mehltau"
                value={commonDiseases}
                onChange={(e) => setCommonDiseases(e.target.value)}
              />
              <p className="mt-1 text-xs text-text-secondary">
                Mit Kommas trennen
              </p>
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
                : "Eintrag hinzufuegen"}
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
