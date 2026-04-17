import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ZodError } from "zod";
import { userPlantKnowledgeRepository } from "../db/index.ts";
import { post } from "../db/api/client.ts";
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
  isPerennial: "Mehrjährig",
  sunNeeds: "Sonnenbedarf",
  waterNeeds: "Wasserbedarf",
  soilPreference: "Boden",
  growthRate: "Wachstumsrate",
  heightCm: "Höhe (cm)",
  spreadCm: "Breite (cm)",
  spacingCm: "Abstand (cm)",
  winterHardinessC: "Winterhärte (°C)",
  growthHabit: "Wuchsform",
  nativeRegion: "Herkunft",
  careNotes: "Pflegehinweise",
};

// ─── Month picker ───

const MONTH_SHORT = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];

function MonthPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number[];
  onChange: (v: number[]) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-text-secondary">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {MONTH_SHORT.map((m, i) => {
          const month = i + 1;
          const selected = value.includes(month);
          return (
            <button
              key={month}
              type="button"
              onClick={() =>
                onChange(
                  selected
                    ? value.filter((n) => n !== month)
                    : [...value, month].sort((a, b) => a - b),
                )
              }
              className={`h-9 w-10 rounded-lg text-xs font-medium transition-colors ${
                selected
                  ? "bg-primary text-white"
                  : "bg-surface-muted text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Component ───

export default function KnowledgeFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = !!id;

  // ── URL import state ──
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // ── Basic form state ──
  const [species, setSpecies] = useState("");
  const [commonName, setCommonName] = useState("");
  const [variety, setVariety] = useState("");
  const [plantType, setPlantType] = useState<PlantType>("ornamental");
  const [isPerennial, setIsPerennial] = useState(true);
  const [family, setFamily] = useState("");
  const [sunNeeds, setSunNeeds] = useState<SunExposure>("partial_shade");
  const [waterNeeds, setWaterNeeds] = useState<WaterNeeds>("moderate");
  const [soilPreference, setSoilPreference] = useState("");
  const [growthRate, setGrowthRate] = useState<GrowthRate | "">("");

  // ── NaturaDB fields ──
  const [heightCm, setHeightCm] = useState("");
  const [spreadCm, setSpreadCm] = useState("");
  const [spacingCm, setSpacingCm] = useState("");
  const [bloomMonths, setBloomMonths] = useState<number[]>([]);
  const [flowerColors, setFlowerColors] = useState("");
  const [winterHardinessC, setWinterHardinessC] = useState("");
  const [usageTypes, setUsageTypes] = useState("");
  const [growthHabit, setGrowthHabit] = useState("");
  const [nativeRegion, setNativeRegion] = useState("");
  const [plantingMonths, setPlantingMonths] = useState<number[]>([]);
  const [pruningMonths, setPruningMonths] = useState<number[]>([]);
  const [careNotes, setCareNotes] = useState("");
  const [standortInfo, setStandortInfo] = useState("");
  const [schnittInfo, setSchnittInfo] = useState("");
  const [vermehrung, setVermehrung] = useState("");
  const [vermehrungInfo, setVermehrungInfo] = useState("");
  const [verwendungInfo, setVerwendungInfo] = useState("");
  const [schaedlingeInfo, setSchaedlingeInfo] = useState("");

  // ── Timing fields (vegetable/herb use) ──
  const [indoorStart, setIndoorStart] = useState("");
  const [transplant, setTransplant] = useState("");
  const [directSowBefore, setDirectSowBefore] = useState("");
  const [directSowAfter, setDirectSowAfter] = useState("");
  const [germination, setGermination] = useState("");
  const [maturity, setMaturity] = useState("");

  // ── Companions & issues ──
  const [goodCompanions, setGoodCompanions] = useState("");
  const [badCompanions, setBadCompanions] = useState("");
  const [commonPests, setCommonPests] = useState("");
  const [commonDiseases, setCommonDiseases] = useState("");

  // ── Submission state ──
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(isEditing);

  // ─── Load existing data for edit ───────────────────────────────────────────

  useEffect(() => {
    if (!id) return;

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
      setFamily(entry.family ?? "");
      setSunNeeds(entry.sunNeeds);
      setWaterNeeds(entry.waterNeeds);
      setSoilPreference(entry.soilPreference ?? "");
      setGrowthRate(entry.growthRate ?? "");

      setHeightCm(entry.heightCm != null ? String(entry.heightCm) : "");
      setSpreadCm(entry.spreadCm != null ? String(entry.spreadCm) : "");
      setSpacingCm(entry.spacingCm != null ? String(entry.spacingCm) : "");
      setBloomMonths(entry.bloomMonths ?? []);
      setFlowerColors(entry.flowerColors?.join(", ") ?? "");
      setWinterHardinessC(entry.winterHardinessC != null ? String(entry.winterHardinessC) : "");
      setUsageTypes(entry.usageTypes?.join(", ") ?? "");
      setGrowthHabit(entry.growthHabit ?? "");
      setNativeRegion(entry.nativeRegion ?? "");
      setPlantingMonths(entry.plantingMonths ?? []);
      setPruningMonths(entry.pruningMonths ?? []);
      setCareNotes(entry.careNotes ?? "");
      setStandortInfo(entry.standortInfo ?? "");
      setSchnittInfo(entry.schnittInfo ?? "");
      setVermehrung(entry.vermehrung?.join(", ") ?? "");
      setVermehrungInfo(entry.vermehrungInfo ?? "");
      setVerwendungInfo(entry.verwendungInfo ?? "");
      setSchaedlingeInfo(entry.schaedlingeInfo ?? "");

      setIndoorStart(entry.indoorStartWeeksBeforeLastFrost != null ? String(entry.indoorStartWeeksBeforeLastFrost) : "");
      setTransplant(entry.transplantWeeksAfterLastFrost != null ? String(entry.transplantWeeksAfterLastFrost) : "");
      setDirectSowBefore(entry.directSowWeeksBeforeLastFrost != null ? String(entry.directSowWeeksBeforeLastFrost) : "");
      setDirectSowAfter(entry.directSowWeeksAfterLastFrost != null ? String(entry.directSowWeeksAfterLastFrost) : "");
      setGermination(entry.daysToGermination != null ? String(entry.daysToGermination) : "");
      setMaturity(entry.daysToMaturity != null ? String(entry.daysToMaturity) : "");
      setGoodCompanions(entry.goodCompanions?.join(", ") ?? "");
      setBadCompanions(entry.badCompanions?.join(", ") ?? "");
      setCommonPests(entry.commonPests?.join(", ") ?? "");
      setCommonDiseases(entry.commonDiseases?.join(", ") ?? "");

      setLoading(false);
    })();
  }, [id, navigate]);

  // ─── URL Import ────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportError(null);
    try {
      const data = await post<Record<string, unknown>>(
        "/api/knowledge/import-url",
        { url: importUrl.trim() },
      );

      // Prefill form fields from extracted data
      if (typeof data.commonName === "string") setCommonName(data.commonName);
      if (typeof data.species === "string") setSpecies(data.species);
      if (typeof data.variety === "string") setVariety(data.variety);
      if (typeof data.plantType === "string") setPlantType(data.plantType as PlantType);
      if (typeof data.isPerennial === "boolean") setIsPerennial(data.isPerennial);
      if (typeof data.family === "string") setFamily(data.family);
      if (typeof data.sunNeeds === "string") setSunNeeds(data.sunNeeds as SunExposure);
      if (typeof data.waterNeeds === "string") setWaterNeeds(data.waterNeeds as WaterNeeds);
      if (typeof data.soilPreference === "string") setSoilPreference(data.soilPreference);
      if (typeof data.growthHabit === "string") setGrowthHabit(data.growthHabit);
      if (typeof data.nativeRegion === "string") setNativeRegion(data.nativeRegion);
      if (typeof data.careNotes === "string") setCareNotes(data.careNotes);
      if (typeof data.standortInfo === "string") setStandortInfo(data.standortInfo);
      if (typeof data.schnittInfo === "string") setSchnittInfo(data.schnittInfo);
      if (Array.isArray(data.vermehrung)) setVermehrung((data.vermehrung as string[]).join(", "));
      if (typeof data.vermehrungInfo === "string") setVermehrungInfo(data.vermehrungInfo);
      if (typeof data.verwendungInfo === "string") setVerwendungInfo(data.verwendungInfo);
      if (typeof data.schaedlingeInfo === "string") setSchaedlingeInfo(data.schaedlingeInfo);
      if (typeof data.heightCm === "number") setHeightCm(String(data.heightCm));
      if (typeof data.spreadCm === "number") setSpreadCm(String(data.spreadCm));
      if (typeof data.spacingCm === "number") setSpacingCm(String(data.spacingCm));
      if (typeof data.winterHardinessC === "number") setWinterHardinessC(String(data.winterHardinessC));
      if (Array.isArray(data.bloomMonths)) setBloomMonths(data.bloomMonths as number[]);
      if (Array.isArray(data.plantingMonths)) setPlantingMonths(data.plantingMonths as number[]);
      if (Array.isArray(data.pruningMonths)) setPruningMonths(data.pruningMonths as number[]);
      if (Array.isArray(data.flowerColors)) setFlowerColors((data.flowerColors as string[]).join(", "));
      if (Array.isArray(data.usageTypes)) setUsageTypes((data.usageTypes as string[]).join(", "));
      if (Array.isArray(data.goodCompanions)) setGoodCompanions((data.goodCompanions as string[]).join(", "));
      if (Array.isArray(data.badCompanions)) setBadCompanions((data.badCompanions as string[]).join(", "));
      if (Array.isArray(data.commonPests)) setCommonPests((data.commonPests as string[]).join(", "));
      if (Array.isArray(data.commonDiseases)) setCommonDiseases((data.commonDiseases as string[]).join(", "));

      toast("Daten importiert — bitte prüfen und speichern", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import fehlgeschlagen.";
      setImportError(msg);
    } finally {
      setImporting(false);
    }
  };

  // ─── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    if (!species.trim() || !commonName.trim()) {
      setErrors(["Artname und Trivialname sind erforderlich."]);
      return;
    }

    setSaving(true);

    try {
      const parseList = (s: string) =>
        s.split(",").map((v) => v.trim()).filter((v) => v.length > 0);

      const parseOptionalInt = (s: string) => {
        if (!s.trim()) return undefined;
        const n = Number(s);
        return Number.isNaN(n) ? undefined : Math.round(n);
      };

      const cropGroup = commonName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/g, "-")
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

      const trimmedFamily = family.trim();
      if (trimmedFamily) input.family = trimmedFamily;

      const trimmedSoil = soilPreference.trim();
      if (trimmedSoil) input.soilPreference = trimmedSoil;

      if (growthRate) input.growthRate = growthRate;

      // NaturaDB fields
      const heightNum = parseOptionalInt(heightCm);
      if (heightNum != null) input.heightCm = heightNum;

      const spreadNum = parseOptionalInt(spreadCm);
      if (spreadNum != null) input.spreadCm = spreadNum;

      const spacingNum = parseOptionalInt(spacingCm);
      if (spacingNum != null) input.spacingCm = spacingNum;

      const hardNum = parseOptionalInt(winterHardinessC);
      if (hardNum != null) input.winterHardinessC = hardNum;

      const trimmedHabit = growthHabit.trim();
      if (trimmedHabit) input.growthHabit = trimmedHabit;

      const trimmedRegion = nativeRegion.trim();
      if (trimmedRegion) input.nativeRegion = trimmedRegion;

      const trimmedCare = careNotes.trim();
      if (trimmedCare) input.careNotes = trimmedCare;

      const trimmedStandort = standortInfo.trim();
      if (trimmedStandort) input.standortInfo = trimmedStandort;

      const trimmedSchnitt = schnittInfo.trim();
      if (trimmedSchnitt) input.schnittInfo = trimmedSchnitt;

      const vermehrungList = parseList(vermehrung);
      if (vermehrungList.length > 0) input.vermehrung = vermehrungList;

      const trimmedVermehrungInfo = vermehrungInfo.trim();
      if (trimmedVermehrungInfo) input.vermehrungInfo = trimmedVermehrungInfo;

      const trimmedVerwendungInfo = verwendungInfo.trim();
      if (trimmedVerwendungInfo) input.verwendungInfo = trimmedVerwendungInfo;

      const trimmedSchaedlinge = schaedlingeInfo.trim();
      if (trimmedSchaedlinge) input.schaedlingeInfo = trimmedSchaedlinge;

      if (bloomMonths.length > 0) input.bloomMonths = bloomMonths;
      if (plantingMonths.length > 0) input.plantingMonths = plantingMonths;
      if (pruningMonths.length > 0) input.pruningMonths = pruningMonths;

      const flowerColorList = parseList(flowerColors);
      if (flowerColorList.length > 0) input.flowerColors = flowerColorList;

      const usageList = parseList(usageTypes);
      if (usageList.length > 0) input.usageTypes = usageList;

      // Timing fields (vegetable/herb)
      const indoorNum = parseOptionalInt(indoorStart);
      if (indoorNum != null) input.indoorStartWeeksBeforeLastFrost = indoorNum;

      const transplantNum = parseOptionalInt(transplant);
      if (transplantNum != null) input.transplantWeeksAfterLastFrost = transplantNum;

      const sowBeforeNum = parseOptionalInt(directSowBefore);
      if (sowBeforeNum != null) input.directSowWeeksBeforeLastFrost = sowBeforeNum;

      const sowAfterNum = parseOptionalInt(directSowAfter);
      if (sowAfterNum != null) input.directSowWeeksAfterLastFrost = sowAfterNum;

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

      // Always store source URL if import was used
      if (importUrl.trim()) input.sourceUrl = importUrl.trim();

      let entry;
      if (isEditing && id) {
        entry = await userPlantKnowledgeRepository.update(id, input, { replaceAll: true });
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
              typeof field === "string" ? (FIELD_LABELS[field] ?? field) : "Feld";
            return `${label}: ${issue.message}`;
          }),
        );
      } else {
        const message = err instanceof Error ? err.message : "Eintrag konnte nicht gespeichert werden.";
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

  const backPath = isEditing && id ? `/knowledge/${id}` : "/knowledge";

  return (
    <div className="mx-auto max-w-2xl p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void navigate(backPath)}
          className="rounded-lg p-1.5 text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary"
          aria-label="Zurück"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="font-display text-2xl font-bold text-text-heading">
          {isEditing ? "Wissenseintrag bearbeiten" : "Wissenseintrag hinzufügen"}
        </h1>
      </div>

      {/* URL Import */}
      {!isEditing && (
        <Card className="mt-6">
          <h2 className="font-display text-lg font-semibold text-text-heading">
            Aus URL importieren
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Pflanzendaten von naturadb.de oder einer anderen Seite automatisch einlesen.
            Das Formular wird vorausgefüllt — du kannst alles anpassen bevor du speicherst.
          </p>
          <div className="mt-3 flex gap-2">
            <Input
              type="url"
              placeholder="https://www.naturadb.de/pflanzen/..."
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleImport();
                }
              }}
              className="flex-1"
            />
            <Button
              type="button"
              onClick={() => void handleImport()}
              disabled={importing || !importUrl.trim()}
            >
              {importing ? "Lädt…" : "Laden"}
            </Button>
          </div>
          {importError && (
            <p className="mt-2 text-sm text-terracotta-600">{importError}</p>
          )}
        </Card>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-6">

        {/* Basic Info */}
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-heading">Grunddaten</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="species" className="mb-1 block text-sm font-medium text-text-secondary">
                Artname (botanisch) <span className="text-terracotta-500">*</span>
              </label>
              <Input id="species" type="text" placeholder="z. B. Kolkwitzia amabilis" value={species} onChange={(e) => setSpecies(e.target.value)} />
            </div>
            <div>
              <label htmlFor="commonName" className="mb-1 block text-sm font-medium text-text-secondary">
                Trivialname <span className="text-terracotta-500">*</span>
              </label>
              <Input id="commonName" type="text" placeholder="z. B. Perlmuttstrauch" value={commonName} onChange={(e) => setCommonName(e.target.value)} />
            </div>
            <div>
              <label htmlFor="variety" className="mb-1 block text-sm font-medium text-text-secondary">Sorte</label>
              <Input id="variety" type="text" placeholder="z. B. Pink Cloud" value={variety} onChange={(e) => setVariety(e.target.value)} />
            </div>
            <div>
              <label htmlFor="family" className="mb-1 block text-sm font-medium text-text-secondary">Familie</label>
              <Input id="family" type="text" placeholder="z. B. Caprifoliaceae" value={family} onChange={(e) => setFamily(e.target.value)} />
            </div>
            <div>
              <label htmlFor="plantType" className="mb-1 block text-sm font-medium text-text-secondary">
                Pflanzentyp <span className="text-terracotta-500">*</span>
              </label>
              <select id="plantType" value={plantType} onChange={(e) => setPlantType(e.target.value as PlantType)} className={selectClass}>
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor="isPerennial" className="text-sm font-medium text-text-secondary">
                Mehrjährig <span className="text-terracotta-500">*</span>
              </label>
              <button
                type="button"
                id="isPerennial"
                role="switch"
                aria-checked={isPerennial}
                onClick={() => setIsPerennial(!isPerennial)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${isPerennial ? "bg-green-600" : "bg-brown-200"}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${isPerennial ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
          </div>
        </Card>

        {/* Appearance & Origin */}
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-heading">Erscheinung & Herkunft</h2>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="heightCm" className="mb-1 block text-sm font-medium text-text-secondary">Höhe (cm)</label>
                <Input id="heightCm" type="number" min="1" placeholder="150" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
              </div>
              <div>
                <label htmlFor="spreadCm" className="mb-1 block text-sm font-medium text-text-secondary">Breite (cm)</label>
                <Input id="spreadCm" type="number" min="1" placeholder="120" value={spreadCm} onChange={(e) => setSpreadCm(e.target.value)} />
              </div>
              <div>
                <label htmlFor="spacingCm" className="mb-1 block text-sm font-medium text-text-secondary">Abstand (cm)</label>
                <Input id="spacingCm" type="number" min="1" placeholder="100" value={spacingCm} onChange={(e) => setSpacingCm(e.target.value)} />
              </div>
            </div>
            <div>
              <label htmlFor="flowerColors" className="mb-1 block text-sm font-medium text-text-secondary">Blütenfarben</label>
              <Input id="flowerColors" type="text" placeholder="z. B. weiß, rosa" value={flowerColors} onChange={(e) => setFlowerColors(e.target.value)} />
              <p className="mt-1 text-xs text-text-secondary">Mit Kommas trennen</p>
            </div>
            <div>
              <label htmlFor="growthHabit" className="mb-1 block text-sm font-medium text-text-secondary">Wuchsform</label>
              <Input id="growthHabit" type="text" placeholder="z. B. aufrecht, buschig, ausladend" value={growthHabit} onChange={(e) => setGrowthHabit(e.target.value)} />
            </div>
            <div>
              <label htmlFor="nativeRegion" className="mb-1 block text-sm font-medium text-text-secondary">Herkunft</label>
              <Input id="nativeRegion" type="text" placeholder="z. B. Ostasien, Mittelmeer" value={nativeRegion} onChange={(e) => setNativeRegion(e.target.value)} />
            </div>
            <div>
              <label htmlFor="usageTypes" className="mb-1 block text-sm font-medium text-text-secondary">Verwendung (Schlagworte)</label>
              <Input id="usageTypes" type="text" placeholder="z. B. Beet, Kübel, Hecke, Bodendecker" value={usageTypes} onChange={(e) => setUsageTypes(e.target.value)} />
              <p className="mt-1 text-xs text-text-secondary">Mit Kommas trennen</p>
            </div>
            <div>
              <label htmlFor="verwendungInfo" className="mb-1 block text-sm font-medium text-text-secondary">Verwendung (vollständig)</label>
              <textarea
                id="verwendungInfo"
                rows={3}
                placeholder="Vollständige Beschreibung der Verwendungsmöglichkeiten..."
                value={verwendungInfo}
                onChange={(e) => setVerwendungInfo(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25 resize-y"
              />
            </div>
          </div>
        </Card>

        {/* Calendar fields */}
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-heading">Kalender</h2>
          <div className="mt-4 space-y-5">
            <MonthPicker label="Blütezeit" value={bloomMonths} onChange={setBloomMonths} />
            <MonthPicker label="Pflanzzeit" value={plantingMonths} onChange={setPlantingMonths} />
            <MonthPicker label="Schnittzeit" value={pruningMonths} onChange={setPruningMonths} />
          </div>
        </Card>

        {/* Care Requirements */}
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-heading">Pflegebedarf</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="sunNeeds" className="mb-1 block text-sm font-medium text-text-secondary">
                Sonnenbedarf <span className="text-terracotta-500">*</span>
              </label>
              <select id="sunNeeds" value={sunNeeds} onChange={(e) => setSunNeeds(e.target.value as SunExposure)} className={selectClass}>
                {SUN_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="waterNeeds" className="mb-1 block text-sm font-medium text-text-secondary">
                Wasserbedarf <span className="text-terracotta-500">*</span>
              </label>
              <select id="waterNeeds" value={waterNeeds} onChange={(e) => setWaterNeeds(e.target.value as WaterNeeds)} className={selectClass}>
                {WATER_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="soilPreference" className="mb-1 block text-sm font-medium text-text-secondary">Bodenanforderungen</label>
              <Input id="soilPreference" type="text" placeholder="z. B. durchlässig, humos, leicht sauer" value={soilPreference} onChange={(e) => setSoilPreference(e.target.value)} />
            </div>
            <div>
              <label htmlFor="standortInfo" className="mb-1 block text-sm font-medium text-text-secondary">Standort</label>
              <textarea
                id="standortInfo"
                rows={2}
                placeholder="z. B. Sonnig bis halbschattig, windgeschützt, humoser durchlässiger Boden"
                value={standortInfo}
                onChange={(e) => setStandortInfo(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25 resize-y"
              />
            </div>
            <div>
              <label htmlFor="winterHardinessC" className="mb-1 block text-sm font-medium text-text-secondary">Winterhärte (min. °C)</label>
              <Input id="winterHardinessC" type="number" placeholder="-20" value={winterHardinessC} onChange={(e) => setWinterHardinessC(e.target.value)} />
              <p className="mt-1 text-xs text-text-secondary">Niedrigste Temperatur die die Pflanze verträgt, z. B. -20</p>
            </div>
            <div>
              <label htmlFor="growthRate" className="mb-1 block text-sm font-medium text-text-secondary">Wachstumsrate</label>
              <select id="growthRate" value={growthRate} onChange={(e) => setGrowthRate(e.target.value as GrowthRate | "")} className={selectClass}>
                <option value="">Nicht angegeben</option>
                {GROWTH_RATE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="careNotes" className="mb-1 block text-sm font-medium text-text-secondary">Pflegehinweise</label>
              <textarea
                id="careNotes"
                rows={3}
                placeholder="Allgemeine Pflegehinweise..."
                value={careNotes}
                onChange={(e) => setCareNotes(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25 resize-y"
              />
            </div>
            <div>
              <label htmlFor="schnittInfo" className="mb-1 block text-sm font-medium text-text-secondary">Schnitt</label>
              <textarea
                id="schnittInfo"
                rows={2}
                placeholder="z. B. Rückschnitt nach der Blüte, Formschnitt im Frühjahr möglich"
                value={schnittInfo}
                onChange={(e) => setSchnittInfo(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25 resize-y"
              />
            </div>
            <div>
              <label htmlFor="vermehrung" className="mb-1 block text-sm font-medium text-text-secondary">Vermehrung (Schlagworte)</label>
              <Input
                id="vermehrung"
                type="text"
                placeholder="z. B. Stecklinge, Aussaat, Teilung, Ableger"
                value={vermehrung}
                onChange={(e) => setVermehrung(e.target.value)}
              />
              <p className="mt-1 text-xs text-text-secondary">Mit Kommas trennen</p>
            </div>
            <div>
              <label htmlFor="vermehrungInfo" className="mb-1 block text-sm font-medium text-text-secondary">Vermehrung (vollständig)</label>
              <textarea
                id="vermehrungInfo"
                rows={3}
                placeholder="Vollständige Beschreibung der Vermehrungsmethoden..."
                value={vermehrungInfo}
                onChange={(e) => setVermehrungInfo(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25 resize-y"
              />
            </div>
          </div>
        </Card>

        {/* Planting Timing (for vegetables/herbs) */}
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-heading">Anzucht & Timing</h2>
          <p className="mt-1 text-xs text-text-secondary">Hauptsächlich für Gemüse und Kräuter relevant</p>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="indoorStart" className="mb-1 block text-sm font-medium text-text-secondary">Vorkultur (Wo. vor Frost)</label>
                <Input id="indoorStart" type="number" placeholder="6" value={indoorStart} onChange={(e) => setIndoorStart(e.target.value)} />
              </div>
              <div>
                <label htmlFor="transplant" className="mb-1 block text-sm font-medium text-text-secondary">Auspflanzen (Wo. nach Frost)</label>
                <Input id="transplant" type="number" placeholder="2" value={transplant} onChange={(e) => setTransplant(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="directSowBefore" className="mb-1 block text-sm font-medium text-text-secondary">Direktsaat (Wo. vor Frost)</label>
                <Input id="directSowBefore" type="number" placeholder="4" value={directSowBefore} onChange={(e) => setDirectSowBefore(e.target.value)} />
              </div>
              <div>
                <label htmlFor="directSowAfter" className="mb-1 block text-sm font-medium text-text-secondary">Direktsaat (Wo. nach Frost)</label>
                <Input id="directSowAfter" type="number" placeholder="2" value={directSowAfter} onChange={(e) => setDirectSowAfter(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="germination" className="mb-1 block text-sm font-medium text-text-secondary">Tage bis zur Keimung</label>
                <Input id="germination" type="number" min="1" placeholder="7" value={germination} onChange={(e) => setGermination(e.target.value)} />
              </div>
              <div>
                <label htmlFor="maturity" className="mb-1 block text-sm font-medium text-text-secondary">Tage bis zur Reife</label>
                <Input id="maturity" type="number" min="1" placeholder="75" value={maturity} onChange={(e) => setMaturity(e.target.value)} />
              </div>
            </div>
          </div>
        </Card>

        {/* Companions & Issues */}
        <Card>
          <h2 className="font-display text-lg font-semibold text-text-heading">Nachbarn und Probleme</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor="goodCompanions" className="mb-1 block text-sm font-medium text-text-secondary">Gute Nachbarn / Pflanzenpartner</label>
              <Input id="goodCompanions" type="text" placeholder="z. B. Rosen, Lavendel, Iris" value={goodCompanions} onChange={(e) => setGoodCompanions(e.target.value)} />
              <p className="mt-1 text-xs text-text-secondary">Mit Kommas trennen</p>
            </div>
            <div>
              <label htmlFor="badCompanions" className="mb-1 block text-sm font-medium text-text-secondary">Schlechte Nachbarn</label>
              <Input id="badCompanions" type="text" placeholder="z. B. Fenchel" value={badCompanions} onChange={(e) => setBadCompanions(e.target.value)} />
              <p className="mt-1 text-xs text-text-secondary">Mit Kommas trennen</p>
            </div>
            <div>
              <label htmlFor="commonPests" className="mb-1 block text-sm font-medium text-text-secondary">Häufige Schädlinge</label>
              <Input id="commonPests" type="text" placeholder="z. B. Blattläuse, Spinnmilben" value={commonPests} onChange={(e) => setCommonPests(e.target.value)} />
              <p className="mt-1 text-xs text-text-secondary">Mit Kommas trennen</p>
            </div>
            <div>
              <label htmlFor="commonDiseases" className="mb-1 block text-sm font-medium text-text-secondary">Häufige Krankheiten</label>
              <Input id="commonDiseases" type="text" placeholder="z. B. Echter Mehltau" value={commonDiseases} onChange={(e) => setCommonDiseases(e.target.value)} />
              <p className="mt-1 text-xs text-text-secondary">Mit Kommas trennen</p>
            </div>
            <div>
              <label htmlFor="schaedlingeInfo" className="mb-1 block text-sm font-medium text-text-secondary">Schädlinge & Krankheiten (vollständig)</label>
              <textarea
                id="schaedlingeInfo"
                rows={3}
                placeholder="Vollständige Beschreibung von Schädlingen, Krankheiten und Bekämpfungsmaßnahmen..."
                value={schaedlingeInfo}
                onChange={(e) => setSchaedlingeInfo(e.target.value)}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring/25 resize-y"
              />
            </div>
          </div>
        </Card>

        {/* Error display */}
        {errors.length > 0 && (
          <div className="rounded-lg bg-terracotta-400/10 p-3">
            {errors.map((err, i) => (
              <p key={i} className="text-sm text-terracotta-600">{err}</p>
            ))}
          </div>
        )}

        {/* Submit */}
        <div className="flex gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? "Speichert…" : isEditing ? "Änderungen speichern" : "Eintrag hinzufügen"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void navigate(backPath)}>
            Abbrechen
          </Button>
        </div>
      </form>
    </div>
  );
}
