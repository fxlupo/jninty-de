import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  memo,
} from "react";
import { Stage, Layer, Rect, Text, Group, Shape, Circle } from "react-konva";
import type Konva from "konva";
import { usePouchQuery } from "../hooks/usePouchQuery.ts";
import { useNavigate } from "react-router-dom";
import { gardenBedRepository, plantingRepository, plantRepository, gardenMapPinRepository } from "../db/index.ts";
import type { GardenMapPin } from "../validation/gardenMapPin.schema.ts";
import type {
  GardenBed,
  BedType,
  BedSunExposure,
} from "../validation/gardenBed.schema.ts";
import type { Planting } from "../validation/planting.schema.ts";
import type {
  PlantInstance,
  PlantType,
} from "../validation/plantInstance.schema.ts";
import { useActiveSeason } from "../hooks/useActiveSeason";
import Button from "../components/ui/Button";
import {
  analyzeBedCompanions,
  getPlantTokenStatuses,
} from "../services/companionAnalysis.ts";
import type {
  PlantTokenStatus,
  CompanionReport,
} from "../services/companionAnalysis.ts";
import CompanionReportSection from "../components/garden/CompanionReportSection.tsx";

// ── Constants ──

const CELL_SIZE = 48;    // px per grid cell (world units)
const CELL_M = 0.5;      // 1 cell = 50 cm → 2 cells per metre
const GRID_COLOR = "#e5ddd0";
const GRID_COLS = 60;    // 60 × 0.5 m = 30 m wide (extra space beyond default view)
const GRID_ROWS = 40;    // 40 × 0.5 m = 20 m tall (extra space beyond default view)
// Default viewport target: 25 m wide × 15 m tall = 50 × 30 cells
const DEFAULT_VIEW_COLS = 50;
const DEFAULT_VIEW_ROWS = 30;
/** Pin radius in world-units from plant spread diameter.
 *  sizeM=0.5 → 24 px, 1.0 → 48 px (= 1 cell), 2.0 → 96 px (= 2 cells) */
function pinRadius(sizeM: number): number {
  return sizeM * CELL_SIZE;
}

const ZOOM_MIN = 0.08;
const ZOOM_MAX = 3;
const ZOOM_STEP = 1.3;

const BED_COLORS = [
  "#7dbf4e", // green
  "#d4623a", // terracotta
  "#b87a2a", // brown
  "#5da02e", // dark green
  "#e8825a", // light terracotta
  "#9e641e", // dark brown
  "#a3d67a", // light green
  "#d49a4e", // golden
];

const BED_TYPE_LABELS: Record<BedType, string> = {
  vegetable_bed: "Gemüsebeet",
  flower_bed: "Blumenbeet",
  fruit_area: "Obstbereich",
  herb_garden: "Kräutergarten",
  container: "Behälter",
  other: "Sonstiges",
};

const SUN_LABELS: Record<BedSunExposure, string> = {
  full_sun: "Vollsonne",
  partial_shade: "Halbschatten",
  full_shade: "Vollschatten",
};

const PLANT_TOKEN_COLORS: Record<PlantType, string> = {
  vegetable: "#5da02e",
  herb: "#7dbf4e",
  flower: "#d4623a",
  ornamental: "#b87a2a",
  fruit_tree: "#9e641e",
  berry: "#e8825a",
  shrub: "#4a7c59",
  hedge: "#2e5e3e",
  other: "#634120",
};

const MAX_VISIBLE_TOKENS = 50;

// ── Tool types ──

type Tool = "select" | "edit" | "draw" | "pin";

interface DrawRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

// ── Helpers ──

function snapToGrid(value: number): number {
  return Math.round(value / CELL_SIZE);
}

function gridToPx(gridUnits: number): number {
  return gridUnits * CELL_SIZE;
}

// ── Grid background component ──

const GridLines = memo(function GridLines({ cols, rows }: { cols: number; rows: number }) {
  const width = cols * CELL_SIZE;
  const height = rows * CELL_SIZE;

  return (
    <Shape
      listening={false}
      sceneFunc={(ctx) => {
        // Thin sub-cell lines (0.5 px)
        ctx.beginPath();
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= cols; x++) {
          if (x % 2 !== 0) {
            ctx.moveTo(x * CELL_SIZE, 0);
            ctx.lineTo(x * CELL_SIZE, height);
          }
        }
        for (let y = 0; y <= rows; y++) {
          if (y % 2 !== 0) {
            ctx.moveTo(0, y * CELL_SIZE);
            ctx.lineTo(width, y * CELL_SIZE);
          }
        }
        ctx.stroke();

        // Accent metre lines (1 px)
        ctx.beginPath();
        ctx.lineWidth = 1;
        for (let x = 0; x <= cols; x++) {
          if (x % 2 === 0) {
            ctx.moveTo(x * CELL_SIZE, 0);
            ctx.lineTo(x * CELL_SIZE, height);
          }
        }
        for (let y = 0; y <= rows; y++) {
          if (y % 2 === 0) {
            ctx.moveTo(0, y * CELL_SIZE);
            ctx.lineTo(width, y * CELL_SIZE);
          }
        }
        ctx.stroke();
      }}
    />
  );
});

// ── Plant tokens on a bed ──

const PlantTokens = memo(function PlantTokens({
  bed,
  plantings,
  plants,
  companionStatuses,
  onTokenHover,
  onTokenLeave,
}: {
  bed: GardenBed;
  plantings: Planting[];
  plants: Map<string, PlantInstance>;
  companionStatuses?: Map<string, PlantTokenStatus> | undefined;
  onTokenHover?: ((x: number, y: number, messages: string[]) => void) | undefined;
  onTokenLeave?: (() => void) | undefined;
}) {
  const bedPx = {
    x: gridToPx(bed.gridX),
    y: gridToPx(bed.gridY),
    width: gridToPx(bed.gridWidth),
    height: gridToPx(bed.gridHeight),
  };

  const bedPlantings = plantings.filter((p) => p.bedId === bed.id);
  const visibleCount = Math.min(bedPlantings.length, MAX_VISIBLE_TOKENS);
  const overflow = bedPlantings.length - visibleCount;

  const tokenRadius = 6;
  const tokensPerRow = Math.max(
    1,
    Math.floor((bedPx.width - 8) / (tokenRadius * 2 + 4)),
  );

  return (
    <Group>
      {bedPlantings.slice(0, visibleCount).map((planting, i) => {
        const plant = plants.get(planting.plantInstanceId);
        const col = i % tokensPerRow;
        const row = Math.floor(i / tokensPerRow);
        const cx = bedPx.x + 10 + col * (tokenRadius * 2 + 4);
        const cy = bedPx.y + bedPx.height - 10 - row * (tokenRadius * 2 + 4);
        const color = plant
          ? PLANT_TOKEN_COLORS[plant.type] ?? PLANT_TOKEN_COLORS["other"]!
          : PLANT_TOKEN_COLORS["other"]!;

        const tokenStatus = plant
          ? companionStatuses?.get(plant.id)
          : undefined;
        const hasStatus = tokenStatus && tokenStatus.status !== "neutral";
        const ringColor =
          tokenStatus?.status === "bad" ? "#dc2626" : "#16a34a";

        return (
          <Group key={planting.id}>
            {hasStatus && (
              <Circle
                x={cx}
                y={cy}
                radius={tokenRadius + 2.5}
                fill="transparent"
                stroke={ringColor}
                strokeWidth={2}
                listening={false}
              />
            )}
            <Circle
              x={cx}
              y={cy}
              radius={tokenRadius}
              fill={color}
              stroke="#fff"
              strokeWidth={1.5}
              perfectDrawEnabled={false}
              listening={!!hasStatus}
              onMouseEnter={(e) => {
                if (hasStatus && onTokenHover) {
                  const stage = e.target.getStage();
                  const pos = stage?.getPointerPosition();
                  onTokenHover(
                    pos?.x ?? cx,
                    pos?.y ?? cy,
                    tokenStatus.messages,
                  );
                }
              }}
              onMouseLeave={() => {
                onTokenLeave?.();
              }}
            />
          </Group>
        );
      })}
      {overflow > 0 && (
        <Text
          x={bedPx.x + bedPx.width - 30}
          y={bedPx.y + bedPx.height - 16}
          text={`+${overflow}`}
          fontSize={10}
          fill="#fff"
          fontStyle="bold"
          listening={false}
        />
      )}
    </Group>
  );
});

// ── Plant pin circles ──

const PlantPinLayer = memo(function PlantPinLayer({
  pins,
  plants,
  hoveredPinId,
  selectedPinId,
  editMode,
  onPinClick,
  onPinHover,
  onPinLeave,
  onPinDragEnd,
}: {
  pins: GardenMapPin[];
  plants: Map<string, PlantInstance>;
  hoveredPinId: string | null;
  selectedPinId: string | null;
  editMode: boolean;
  onPinClick: (pin: GardenMapPin) => void;
  onPinHover: (pinId: string) => void;
  onPinLeave: () => void;
  onPinDragEnd: (pin: GardenMapPin, e: Konva.KonvaEventObject<DragEvent>) => void;
}) {
  return (
    <Group>
      {pins.map((pin) => {
        const plant = plants.get(pin.plantInstanceId);
        const r = pinRadius(pin.sizeM ?? 0.5);
        const cx = (pin.gridX + 0.5) * CELL_SIZE;
        const cy = (pin.gridY + 0.5) * CELL_SIZE;
        const color = plant
          ? (PLANT_TOKEN_COLORS[plant.type] ?? PLANT_TOKEN_COLORS["other"]!)
          : PLANT_TOKEN_COLORS["other"]!;
        const initials = plant
          ? (plant.nickname ?? plant.species).slice(0, 2).toUpperCase()
          : "??";
        const isHovered = pin.id === hoveredPinId;
        const isSelected = pin.id === selectedPinId;

        return (
          <Group key={pin.id}>
            {/* Selection ring (edit mode) */}
            {isSelected && (
              <Circle
                x={cx} y={cy}
                radius={r + 6}
                fill="transparent"
                stroke="#2D5016"
                strokeWidth={3}
                dash={[8, 4]}
                listening={false}
              />
            )}
            {/* Main circle — hover indicated via strokeWidth, no shadow (expensive on Android) */}
            <Circle
              x={cx} y={cy}
              radius={r}
              fill={color}
              opacity={0.85}
              stroke="#fff"
              strokeWidth={isHovered ? Math.max(3, r * 0.1) : Math.max(1.5, r * 0.05)}
              strokeScaleEnabled={false}
              perfectDrawEnabled={false}
              draggable={editMode}
              onClick={() => onPinClick(pin)}
              onTap={() => onPinClick(pin)}
              onMouseEnter={() => onPinHover(pin.id)}
              onMouseLeave={() => onPinLeave()}
              onDragEnd={(e) => onPinDragEnd(pin, e)}
            />
            {/* Initials label (only when pin is large enough) */}
            {r >= 12 && (
              <Text
                x={cx - r} y={cy - r * 0.45}
                width={r * 2} height={r}
                text={initials}
                fontSize={Math.max(8, r * 0.65)}
                fontFamily="Inter, sans-serif"
                fontStyle="bold"
                fill="#fff"
                align="center"
                listening={false}
              />
            )}
          </Group>
        );
      })}
    </Group>
  );
});


// ── Memoized bed group ──

const BedGroup = memo(function BedGroup({
  bed,
  isSelected,
  isDraggable,
  plantings,
  plants,
  companionStatuses,
  onBedClick,
  onBedDragEnd,
  onTransformEnd,
  onTokenHover,
  onTokenLeave,
}: {
  bed: GardenBed;
  isSelected: boolean;
  isDraggable: boolean;
  plantings: Planting[];
  plants: Map<string, PlantInstance>;
  companionStatuses?: Map<string, PlantTokenStatus> | undefined;
  onBedClick: (id: string) => void;
  onBedDragEnd: (id: string, gx: number, gy: number) => void;
  onTransformEnd: (id: string, node: Konva.Node) => void;
  onTokenHover: (x: number, y: number, messages: string[]) => void;
  onTokenLeave: () => void;
}) {
  return (
    <Group>
      <Rect
        x={gridToPx(bed.gridX)}
        y={gridToPx(bed.gridY)}
        width={gridToPx(bed.gridWidth)}
        height={gridToPx(bed.gridHeight)}
        fill={bed.color}
        opacity={0.7}
        stroke={isSelected ? "#2D5016" : "#fff"}
        strokeWidth={isSelected ? 3 : 1.5}
        perfectDrawEnabled={false}
        draggable={isDraggable}
        onClick={() => onBedClick(bed.id)}
        onTap={() => onBedClick(bed.id)}
        onDragEnd={(e) => {
          const node = e.target;
          const newGx = snapToGrid(node.x());
          const newGy = snapToGrid(node.y());
          node.x(gridToPx(newGx));
          node.y(gridToPx(newGy));
          onBedDragEnd(bed.id, newGx, newGy);
        }}
        onTransformEnd={(e) => {
          onTransformEnd(bed.id, e.target);
        }}
      />
      <Text
        x={gridToPx(bed.gridX) + 6}
        y={gridToPx(bed.gridY) + 4}
        width={gridToPx(bed.gridWidth) - 12}
        text={bed.name}
        fontSize={13}
        fontFamily="Inter, sans-serif"
        fill="#fff"
        fontStyle="bold"
        listening={false}
        ellipsis
        wrap="none"
      />
      <PlantTokens
        bed={bed}
        plantings={plantings}
        plants={plants}
        companionStatuses={companionStatuses}
        onTokenHover={onTokenHover}
        onTokenLeave={onTokenLeave}
      />
    </Group>
  );
});

// ── Bed detail sidebar ──

/** Format grid cells as a human-readable metre string, e.g. 4 cells → "2,0 m" */
function cellsToM(cells: number): string {
  return (cells * CELL_M).toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + " m";
}

function BedDetailPanel({
  bed,
  plantings,
  plants,
  hasActiveSeason,
  companionReport,
  companionStatuses,
  onClose,
  onDelete,
  onQuickLog,
  onAssignPlant,
  onRemovePlant,
  onUpdate,
}: {
  bed: GardenBed;
  plantings: Planting[];
  plants: Map<string, PlantInstance>;
  hasActiveSeason: boolean;
  companionReport: CompanionReport;
  companionStatuses: Map<string, PlantTokenStatus>;
  onClose: () => void;
  onDelete: () => void;
  onQuickLog: () => void;
  onAssignPlant: () => void;
  onRemovePlant: (plantingId: string) => void;
  onUpdate: (changes: {
    name: string;
    type: BedType;
    color: string;
    sunExposure?: BedSunExposure;
    notes?: string;
  }) => void;
}) {
  const bedPlantings = plantings.filter((p) => p.bedId === bed.id);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<BedType>("vegetable_bed");
  const [editColor, setEditColor] = useState(BED_COLORS[0]!);
  const [editSunExposure, setEditSunExposure] = useState<
    BedSunExposure | ""
  >("");
  const [editNotes, setEditNotes] = useState("");

  const enterEditMode = () => {
    setEditName(bed.name);
    setEditType(bed.type);
    setEditColor(bed.color);
    setEditSunExposure(bed.sunExposure ?? "");
    setEditNotes(bed.notes ?? "");
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!editName.trim()) return;
    const changes: {
      name: string;
      type: BedType;
      color: string;
      sunExposure?: BedSunExposure;
      notes?: string;
    } = {
      name: editName.trim(),
      type: editType,
      color: editColor,
    };
    if (editSunExposure) {
      changes.sunExposure = editSunExposure;
    }
    if (editNotes.trim()) {
      changes.notes = editNotes.trim();
    }
    onUpdate(changes);
    setIsEditing(false);
  };

  return (
    <div className="absolute right-0 top-0 z-20 flex h-full w-72 flex-col border-l border-border-default bg-surface-elevated shadow-lg">
      <div className="flex items-center justify-between border-b border-border-default px-4 py-3">
        <h3 className="font-display text-lg font-bold text-text-heading">
          {bed.name}
        </h3>
        <div className="flex items-center gap-1">
          {!isEditing && (
            <button
              onClick={enterEditMode}
              className="rounded p-1 text-text-muted hover:bg-surface hover:text-text-secondary"
              aria-label="Beet bearbeiten"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded p-1 text-text-muted hover:bg-surface hover:text-text-secondary"
            aria-label="Panel schließen"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isEditing ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text-secondary">
                Name
              </span>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-border-default px-3 py-2 text-sm focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
                autoFocus
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text-secondary">
                Type
              </span>
              <select
                value={editType}
                onChange={(e) => setEditType(e.target.value as BedType)}
                className="w-full rounded-lg border border-border-default px-3 py-2 text-sm focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
              >
                {Object.entries(BED_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text-secondary">
                Sun Exposure
              </span>
              <select
                value={editSunExposure}
                onChange={(e) =>
                  setEditSunExposure(e.target.value as BedSunExposure | "")
                }
                className="w-full rounded-lg border border-border-default px-3 py-2 text-sm focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
              >
                <option value="">Nicht angegeben</option>
                {Object.entries(SUN_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-text-secondary">
                Color
              </legend>
              <div className="flex flex-wrap gap-2">
                {BED_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditColor(c)}
                    className={`h-8 w-8 rounded-full border-2 transition-transform ${
                      editColor === c
                        ? "scale-110 border-green-800"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Farbe ${c}`}
                  />
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-text-secondary">
                Notes
              </span>
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-border-default px-3 py-2 text-sm focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
                placeholder="Optionale Notizen..."
              />
            </label>
          </div>
        ) : (
          <>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-text-secondary">Type</dt>
                <dd className="text-text-primary">
                  {BED_TYPE_LABELS[bed.type] ?? bed.type}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-text-secondary">Größe</dt>
                <dd className="text-text-primary">
                  {cellsToM(bed.gridWidth)} × {cellsToM(bed.gridHeight)}
                </dd>
              </div>
              {bed.sunExposure && (
                <div>
                  <dt className="font-medium text-text-secondary">Sun Exposure</dt>
                  <dd className="text-text-primary">
                    {SUN_LABELS[bed.sunExposure] ?? bed.sunExposure}
                  </dd>
                </div>
              )}
              {bed.notes && (
                <div>
                  <dt className="font-medium text-text-secondary">Notes</dt>
                  <dd className="text-text-primary">{bed.notes}</dd>
                </div>
              )}
            </dl>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-medium text-text-secondary">
                  Plants ({bedPlantings.length})
                </h4>
                {hasActiveSeason && (
                  <button
                    onClick={onAssignPlant}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-text-heading hover:bg-green-50 transition-colors"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Pflanze zuweisen
                  </button>
                )}
              </div>
              {!hasActiveSeason && (
                <p className="mb-2 text-xs text-terracotta-500">
                  Erstelle eine aktive Saison in den Einstellungen, um Pflanzen zuzuweisen.
                </p>
              )}
              {bedPlantings.length === 0 ? (
                <p className="text-sm text-text-muted">
                  Noch keine Pflanzen zugewiesen.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {bedPlantings.map((planting) => {
                    const plant = plants.get(planting.plantInstanceId);
                    const tokenStatus = plant
                      ? companionStatuses.get(plant.id)
                      : undefined;
                    const statusDotColor =
                      tokenStatus?.status === "bad"
                        ? "#dc2626"
                        : tokenStatus?.status === "good"
                          ? "#16a34a"
                          : undefined;
                    const tooltipText = tokenStatus?.messages.join("; ");
                    return (
                      <li
                        key={planting.id}
                        className="group flex items-center gap-2 rounded-md bg-surface px-2.5 py-1.5 text-sm"
                        title={tooltipText}
                      >
                        <span
                          className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{
                            backgroundColor: plant
                              ? PLANT_TOKEN_COLORS[plant.type] ??
                                PLANT_TOKEN_COLORS["other"]
                              : PLANT_TOKEN_COLORS["other"],
                          }}
                        />
                        <span className="flex-1 text-text-primary">
                          {plant?.nickname ??
                            plant?.species ??
                            "Unbekannte Pflanze"}
                        </span>
                        {statusDotColor && (
                          <span
                            className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                            style={{ backgroundColor: statusDotColor }}
                          />
                        )}
                        <button
                          onClick={() => onRemovePlant(planting.id)}
                          className="rounded p-0.5 text-text-muted opacity-0 transition-opacity hover:text-terracotta-500 group-hover:opacity-100"
                          aria-label={`${plant?.nickname ?? plant?.species ?? "Pflanze"} aus Beet entfernen`}
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Companion planting report */}
            <CompanionReportSection report={companionReport} />
          </>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border-default p-4">
        {isEditing ? (
          <>
            <Button
              onClick={handleSave}
              disabled={!editName.trim()}
              className="w-full"
            >
              Speichern
            </Button>
            <Button
              variant="secondary"
              onClick={() => setIsEditing(false)}
              className="w-full"
            >
              Abbrechen
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onQuickLog} className="w-full">
              Schnelleintrag
            </Button>
            <Button
              variant="ghost"
              onClick={onDelete}
              className="w-full text-terracotta-500 hover:text-terracotta-600 hover:bg-terracotta-500/10"
            >
              Beet löschen
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ── New bed form modal ──

function NewBedModal({
  onSave,
  onCancel,
}: {
  onSave: (data: {
    name: string;
    type: BedType;
    color: string;
    sunExposure?: BedSunExposure;
  }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<BedType>("vegetable_bed");
  const [color, setColor] = useState(BED_COLORS[0]!);
  const [sunExposure, setSunExposure] = useState<BedSunExposure | "">("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const data: {
      name: string;
      type: BedType;
      color: string;
      sunExposure?: BedSunExposure;
    } = { name: name.trim(), type, color };
    if (sunExposure) {
      data.sunExposure = sunExposure;
    }
    onSave(data);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl bg-surface-elevated p-5 shadow-xl"
      >
        <h3 className="mb-4 font-display text-lg font-bold text-text-heading">
          Neues Gartenbeet
        </h3>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-text-secondary">
            Name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-border-default px-3 py-2 text-sm focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
            placeholder="z.B. Hochbeet #1"
            autoFocus
          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-text-secondary">
            Typ
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as BedType)}
            className="w-full rounded-lg border border-border-default px-3 py-2 text-sm focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
          >
            {Object.entries(BED_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-text-secondary">
            Sonneneinstrahlung
          </span>
          <select
            value={sunExposure}
            onChange={(e) =>
              setSunExposure(e.target.value as BedSunExposure | "")
            }
            className="w-full rounded-lg border border-border-default px-3 py-2 text-sm focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
          >
            <option value="">Nicht angegeben</option>
            {Object.entries(SUN_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="mb-4">
          <legend className="mb-1.5 text-sm font-medium text-text-secondary">
            Farbe
          </legend>
          <div className="flex flex-wrap gap-2">
            {BED_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full border-2 transition-transform ${
                  color === c
                    ? "scale-110 border-green-800"
                    : "border-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Farbe ${c}`}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex gap-2">
          <Button type="submit" disabled={!name.trim()} className="flex-1">
            Beet erstellen
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Abbrechen
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Assign plant to bed modal ──

function AssignPlantModal({
  bed,
  plantings,
  plants,
  onAssign,
  onClose,
}: {
  bed: GardenBed;
  plantings: Planting[];
  plants: PlantInstance[];
  onAssign: (plantInstanceId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");

  const bedPlantIds = new Set(
    plantings.filter((p) => p.bedId === bed.id).map((p) => p.plantInstanceId),
  );

  const availablePlants = plants
    .filter((p) => !bedPlantIds.has(p.id) && p.status === "active")
    .filter((p) => {
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        p.nickname?.toLowerCase().includes(term) ||
        p.species.toLowerCase().includes(term) ||
        p.variety?.toLowerCase().includes(term)
      );
    });

  const totalActive = plants.filter((p) => p.status === "active").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[70vh] w-full max-w-sm flex-col rounded-xl bg-surface-elevated shadow-xl">
        <div className="p-5 pb-3">
          <h3 className="mb-3 font-display text-lg font-bold text-text-heading">
            Pflanze zuweisen zu {bed.name}
          </h3>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border-default px-3 py-2 text-sm focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
            placeholder="Pflanzen suchen..."
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {availablePlants.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-muted">
              {totalActive === 0
                ? "Noch keine Pflanzen im Katalog. Zuerst Pflanzen anlegen."
                : "Alle aktiven Pflanzen sind diesem Beet bereits zugewiesen."}
            </p>
          ) : (
            <ul className="space-y-1">
              {availablePlants.map((plant) => (
                <li key={plant.id}>
                  <button
                    onClick={() => onAssign(plant.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface"
                  >
                    <span
                      className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          PLANT_TOKEN_COLORS[plant.type] ??
                          PLANT_TOKEN_COLORS["other"],
                      }}
                    />
                    <span className="font-medium text-text-primary">
                      {plant.nickname ?? plant.species}
                    </span>
                    {plant.variety && (
                      <span className="text-xs text-text-muted">
                        ({plant.variety})
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border-default p-4">
          <Button variant="secondary" onClick={onClose} className="w-full">
            Abbrechen
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Plant pin picker modal ──

function PinPlantPickerModal({
  plants,
  onPick,
  onClose,
}: {
  plants: PlantInstance[];
  onPick: (plantInstanceId: string, sizeM: number) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [sizeM, setSizeM] = useState(0.5);

  const filtered = plants
    .filter((p) => p.status !== "removed" && p.status !== "dead")
    .filter((p) => {
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        p.nickname?.toLowerCase().includes(term) ||
        p.species.toLowerCase().includes(term) ||
        p.variety?.toLowerCase().includes(term)
      );
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[70vh] w-full max-w-sm flex-col rounded-xl bg-surface-elevated shadow-xl">
        <div className="p-5 pb-3">
          <h3 className="mb-1 font-display text-lg font-bold text-text-heading">
            Pflanze platzieren
          </h3>
          <p className="mb-3 text-xs text-text-muted">
            Wähle eine Pflanze — sie wird als Kreismarkierung auf der Karte eingefügt.
          </p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border-default px-3 py-2 text-sm focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
            placeholder="Pflanzen suchen..."
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-muted">
              Keine Pflanzen gefunden.
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((plant) => (
                <li key={plant.id}>
                  <button
                    onClick={() => onPick(plant.id, sizeM)}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-surface"
                  >
                    <span
                      className="inline-block h-3 w-3 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: PLANT_TOKEN_COLORS[plant.type] ?? PLANT_TOKEN_COLORS["other"] }}
                    />
                    <span className="font-medium text-text-primary">
                      {plant.nickname ?? plant.species}
                    </span>
                    {plant.variety && (
                      <span className="text-xs text-text-muted">({plant.variety})</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* Size selector */}
        <div className="border-t border-border-default px-5 py-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-text-secondary">Anfangsgröße (Durchmesser)</span>
            <span className="text-xs font-semibold text-text-primary tabular-nums">{sizeM.toFixed(1)} m</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={6}
            step={0.1}
            value={sizeM}
            onChange={(e) => setSizeM(Number(e.target.value))}
            className="w-full accent-green-600"
          />
          <div className="mt-0.5 flex justify-between text-[10px] text-text-muted">
            <span>10 cm</span><span>1 m</span><span>3 m</span><span>6 m</span>
          </div>
        </div>
        <div className="border-t border-border-default p-4">
          <Button variant="secondary" onClick={onClose} className="w-full">
            Abbrechen
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main GardenMapPage ──

export default function GardenMapPage() {
  const navigate = useNavigate();
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Canvas dimensions
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 });

  // Zoom scale — used only for UI indicator; real scale lives in the Konva stage
  const [displayScale, setDisplayScale] = useState(1);
  const scaleDisplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleInitialized = useRef(false);

  /** Update the display-only scale indicator with 100 ms debounce to avoid
   *  triggering React re-renders on every wheel tick. */
  const scheduleDisplayScale = useCallback((v: number) => {
    if (scaleDisplayTimerRef.current) clearTimeout(scaleDisplayTimerRef.current);
    scaleDisplayTimerRef.current = setTimeout(() => setDisplayScale(v), 100);
  }, []);

  // Tool state
  const [tool, setTool] = useState<Tool>("select");
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [drawRect, setDrawRect] = useState<DrawRect | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showNewBedModal, setShowNewBedModal] = useState(false);
  const [showAssignPlant, setShowAssignPlant] = useState(false);
  const [pendingDraw, setPendingDraw] = useState<{
    gridX: number;
    gridY: number;
    gridWidth: number;
    gridHeight: number;
  } | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    messages: string[];
  } | null>(null);

  // Last known view state — updated on every zoom/pan so cleanup always has valid values
  const lastViewRef = useRef({ scaleX: 1, x: 0, y: 0 });

  // Plant pin state
  const pendingPinPosRef = useRef<{ gridX: number; gridY: number } | null>(null);
  const [showPinPicker, setShowPinPicker] = useState(false);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  // Refs for drawing — avoids stale closure in mouseUp when mouseDown
  // state hasn't been committed yet (React batches updates)
  const isDrawingRef = useRef(false);
  const drawRectRef = useRef<DrawRect | null>(null);

  // Data
  const emptyBeds: GardenBed[] = useMemo(() => [], []);
  const emptyPlantings: Planting[] = useMemo(() => [], []);
  const emptyPlants: PlantInstance[] = useMemo(() => [], []);
  const emptyPins: GardenMapPin[] = useMemo(() => [], []);

  const beds = usePouchQuery(() => gardenBedRepository.getAll()) ?? emptyBeds;
  const allPlantings =
    usePouchQuery(() => plantingRepository.getAll()) ?? emptyPlantings;
  const rawPlants =
    usePouchQuery(() => plantRepository.getAll()) ?? emptyPlants;
  const pins = usePouchQuery(() => gardenMapPinRepository.getAll()) ?? emptyPins;

  const activeSeason = useActiveSeason();

  const plantsMap = useMemo(() => {
    const map = new Map<string, PlantInstance>();
    for (const plant of rawPlants) {
      map.set(plant.id, plant);
    }
    return map;
  }, [rawPlants]);

  const allCompanionData = useMemo(() => {
    const statuses = new Map<string, Map<string, PlantTokenStatus>>();
    const reports = new Map<string, CompanionReport>();
    for (const bed of beds) {
      const report = analyzeBedCompanions(bed.id, allPlantings, plantsMap);
      const bedStatuses = getPlantTokenStatuses(
        bed.id,
        allPlantings,
        plantsMap,
        report,
      );
      reports.set(bed.id, report);
      if (bedStatuses.size > 0) {
        statuses.set(bed.id, bedStatuses);
      }
    }
    return { statuses, reports };
  }, [beds, allPlantings, plantsMap]);

  const selectedBed = beds.find((b) => b.id === selectedBedId);

  // Resize handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setStageSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(container);
    // Set initial size
    setStageSize({
      width: container.clientWidth,
      height: container.clientHeight,
    });

    return () => observer.disconnect();
  }, []);

  // Fit-to-view: set Konva stage scale once when container size is first known.
  // Restores the last saved view from sessionStorage if available.
  useEffect(() => {
    if (scaleInitialized.current) return;
    if (stageSize.width === 0 || stageSize.height === 0) return;
    const stage = stageRef.current;
    if (!stage) return;

    const saved = sessionStorage.getItem("gardenMap.view");
    if (saved) {
      try {
        const { scaleX, x, y } = JSON.parse(saved) as { scaleX: number; x: number; y: number };
        stage.scale({ x: scaleX, y: scaleX });
        stage.position({ x, y });
        lastViewRef.current = { scaleX, x, y };
        setDisplayScale(scaleX);
        scaleInitialized.current = true;
        return;
      } catch {
        // fall through to default
      }
    }

    const scale = Math.min(
      stageSize.width / (DEFAULT_VIEW_COLS * CELL_SIZE),
      stageSize.height / (DEFAULT_VIEW_ROWS * CELL_SIZE),
    );
    stage.scale({ x: scale, y: scale });
    stage.position({ x: 0, y: 0 });
    lastViewRef.current = { scaleX: scale, x: 0, y: 0 };
    setDisplayScale(scale);
    scaleInitialized.current = true;
  }, [stageSize]);

  // Persist zoom+pan to sessionStorage on unmount.
  // Uses lastViewRef (always valid) instead of reading from the Konva stage
  // which may already be destroyed when the cleanup runs.
  useEffect(() => {
    return () => {
      sessionStorage.setItem("gardenMap.view", JSON.stringify(lastViewRef.current));
    };
  }, []);

  // ── Zoom helpers ──

  const applyZoom = useCallback((newScale: number, focalX: number, focalY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newScale));
    const oldScale = stage.scaleX();
    const pointTo = {
      x: (focalX - stage.x()) / oldScale,
      y: (focalY - stage.y()) / oldScale,
    };
    const newX = focalX - pointTo.x * clamped;
    const newY = focalY - pointTo.y * clamped;
    stage.scale({ x: clamped, y: clamped });
    stage.position({ x: newX, y: newY });
    lastViewRef.current = { scaleX: clamped, x: newX, y: newY };
    scheduleDisplayScale(clamped);
  }, [scheduleDisplayScale]);

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const direction = e.evt.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    applyZoom(stage.scaleX() * direction, pointer.x, pointer.y);
  }, [applyZoom]);

  const handleZoomIn = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    applyZoom(stage.scaleX() * ZOOM_STEP, stageSize.width / 2, stageSize.height / 2);
  }, [applyZoom, stageSize]);

  const handleZoomOut = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    applyZoom(stage.scaleX() / ZOOM_STEP, stageSize.width / 2, stageSize.height / 2);
  }, [applyZoom, stageSize]);

  const handleFitView = useCallback(() => {
    if (stageSize.width === 0 || stageSize.height === 0) return;
    const scale = Math.min(
      stageSize.width / (DEFAULT_VIEW_COLS * CELL_SIZE),
      stageSize.height / (DEFAULT_VIEW_ROWS * CELL_SIZE),
    );
    const stage = stageRef.current;
    if (stage) {
      stage.scale({ x: scale, y: scale });
      stage.position({ x: 0, y: 0 });
      lastViewRef.current = { scaleX: scale, x: 0, y: 0 };
      setDisplayScale(scale);
    }
  }, [stageSize]);

  // ── Screen → world coordinate helper (accounts for zoom + pan) ──
  const toWorld = useCallback((screenX: number, screenY: number) => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    return {
      x: (screenX - stage.x()) / stage.scaleX(),
      y: (screenY - stage.y()) / stage.scaleY(),
    };
  }, []);

  // ── Drawing handlers ──

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const screenPos = stage.getPointerPosition();
      if (!screenPos) return;
      const pos = toWorld(screenPos.x, screenPos.y);

      if (tool === "pin") {
        // Place a pin at the clicked cell
        const gx = Math.floor(pos.x / CELL_SIZE);
        const gy = Math.floor(pos.y / CELL_SIZE);
        pendingPinPosRef.current = { gridX: gx, gridY: gy };
        setShowPinPicker(true);
        return;
      }

      if (tool !== "draw") return;

      const rect: DrawRect = {
        startX: pos.x,
        startY: pos.y,
        endX: pos.x,
        endY: pos.y,
      };
      isDrawingRef.current = true;
      drawRectRef.current = rect;
      setIsDrawing(true);
      setDrawRect(rect);
    },
    [tool, toWorld],
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (!isDrawingRef.current || !drawRectRef.current) return;

      const stage = e.target.getStage();
      if (!stage) return;
      const screenPos = stage.getPointerPosition();
      if (!screenPos) return;
      const pos = toWorld(screenPos.x, screenPos.y);

      const updated = { ...drawRectRef.current, endX: pos.x, endY: pos.y };
      drawRectRef.current = updated;
      setDrawRect(updated);
    },
    [toWorld],
  );

  const handleStageMouseUp = useCallback(() => {
    if (!isDrawingRef.current || !drawRectRef.current) {
      isDrawingRef.current = false;
      drawRectRef.current = null;
      setIsDrawing(false);
      setDrawRect(null);
      return;
    }

    const dr = drawRectRef.current;
    isDrawingRef.current = false;
    drawRectRef.current = null;
    setIsDrawing(false);
    setDrawRect(null);

    const gx = snapToGrid(Math.min(dr.startX, dr.endX));
    const gy = snapToGrid(Math.min(dr.startY, dr.endY));
    const gw = Math.max(
      1,
      snapToGrid(Math.abs(dr.endX - dr.startX)),
    );
    const gh = Math.max(
      1,
      snapToGrid(Math.abs(dr.endY - dr.startY)),
    );

    if (gw >= 1 && gh >= 1) {
      setPendingDraw({ gridX: gx, gridY: gy, gridWidth: gw, gridHeight: gh });
      setShowNewBedModal(true);
    }
  }, []);

  // ── Bed interaction handlers ──

  const handleBedClick = useCallback(
    (bedId: string) => {
      if (tool === "select" || tool === "edit") {
        setSelectedBedId((prev) => (prev === bedId ? null : bedId));
        setSelectedPinId(null);
      }
    },
    [tool],
  );

  const handleBedDragEnd = useCallback(
    async (bedId: string, gridX: number, gridY: number) => {
      await gardenBedRepository.update(bedId, { gridX, gridY });
    },
    [],
  );

  const handleCreateBed = useCallback(
    async (data: {
      name: string;
      type: BedType;
      color: string;
      sunExposure?: BedSunExposure;
    }) => {
      if (!pendingDraw) return;

      await gardenBedRepository.create({
        name: data.name,
        type: data.type,
        color: data.color,
        gridX: pendingDraw.gridX,
        gridY: pendingDraw.gridY,
        gridWidth: pendingDraw.gridWidth,
        gridHeight: pendingDraw.gridHeight,
        shape: "rectangle" as const,
        sunExposure: data.sunExposure,
      });

      setPendingDraw(null);
      setShowNewBedModal(false);
      setTool("select");
    },
    [pendingDraw],
  );

  const handleDeleteBed = useCallback(async () => {
    if (!selectedBedId) return;
    const bed = beds.find((b) => b.id === selectedBedId);
    const name = bed?.name ?? "this bed";
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await gardenBedRepository.softDelete(selectedBedId);
    setSelectedBedId(null);
  }, [selectedBedId, beds]);

  // ── Plant pin handlers ──

  const handleCreatePin = useCallback(async (plantInstanceId: string, sizeM: number) => {
    const pos = pendingPinPosRef.current;
    if (!pos) return;
    try {
      await gardenMapPinRepository.create({
        plantInstanceId,
        gridX: pos.gridX,
        gridY: pos.gridY,
        sizeM,
      });
      pendingPinPosRef.current = null;
      setShowPinPicker(false);
    } catch (err) {
      console.error("Fehler beim Erstellen des Pflanzen-Pins:", err);
      alert("Pflanze konnte nicht platziert werden. Bitte erneut versuchen.");
    }
  }, []);

  const handlePinClick = useCallback((pin: GardenMapPin) => {
    if (tool === "pin") {
      void gardenMapPinRepository.softDelete(pin.id);
    } else if (tool === "edit") {
      setSelectedPinId((prev) => prev === pin.id ? null : pin.id);
      setSelectedBedId(null);
    } else {
      // select mode: navigate directly to the plant page
      void navigate(`/plants/${pin.plantInstanceId}`);
    }
  }, [tool, navigate]);

  const handlePinSizeChange = useCallback((pinId: string, sizeM: number) => {
    void gardenMapPinRepository.update(pinId, { sizeM });
  }, []);

  const handlePinDragEnd = useCallback((pin: GardenMapPin, e: Konva.KonvaEventObject<DragEvent>) => {
    const node = e.target;
    // Circle x/y = center = (gridX + 0.5) * CELL_SIZE → invert to get gridX
    const newGx = Math.max(0, Math.round(node.x() / CELL_SIZE - 0.5));
    const newGy = Math.max(0, Math.round(node.y() / CELL_SIZE - 0.5));
    node.x((newGx + 0.5) * CELL_SIZE);
    node.y((newGy + 0.5) * CELL_SIZE);
    void gardenMapPinRepository.update(pin.id, { gridX: newGx, gridY: newGy });
  }, []);

  // ── Assign / remove plant from bed ──

  const handleAssignPlant = useCallback(
    async (plantInstanceId: string) => {
      if (!selectedBedId || !activeSeason) return;
      await plantingRepository.create({
        plantInstanceId,
        seasonId: activeSeason.id,
        bedId: selectedBedId,
      });
      setShowAssignPlant(false);
    },
    [selectedBedId, activeSeason],
  );

  const handleRemovePlant = useCallback(async (plantingId: string) => {
    await plantingRepository.softDelete(plantingId);
  }, []);

  const handleUpdateBed = useCallback(
    async (changes: {
      name: string;
      type: BedType;
      color: string;
      sunExposure?: BedSunExposure;
      notes?: string;
    }) => {
      if (!selectedBedId) return;
      await gardenBedRepository.update(selectedBedId, {
        name: changes.name,
        type: changes.type,
        color: changes.color,
        sunExposure: changes.sunExposure,
        notes: changes.notes,
      });
    },
    [selectedBedId],
  );

  // ── Companion token hover ──

  const handleTokenHover = useCallback(
    (x: number, y: number, messages: string[]) => {
      setTooltip({ x, y, messages });
    },
    [],
  );

  const handleTokenLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // ── Transformer / resize ──

  const handleTransformEnd = useCallback(
    async (bedId: string, node: Konva.Node) => {
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();

      const bed = beds.find((b) => b.id === bedId);
      if (!bed) return;

      const newWidth = Math.max(1, snapToGrid(gridToPx(bed.gridWidth) * scaleX));
      const newHeight = Math.max(
        1,
        snapToGrid(gridToPx(bed.gridHeight) * scaleY),
      );
      const newX = snapToGrid(node.x());
      const newY = snapToGrid(node.y());

      // Reset scale and apply new grid dimensions
      node.scaleX(1);
      node.scaleY(1);
      node.x(gridToPx(newX));
      node.y(gridToPx(newY));

      await gardenBedRepository.update(bedId, {
        gridX: newX,
        gridY: newY,
        gridWidth: newWidth,
        gridHeight: newHeight,
      });
    },
    [beds],
  );

  // Stage cursor — set directly on Konva's container element so it isn't
  // overridden by the canvas element's inline styles.
  const stageCursor = tool === "draw" || tool === "pin" ? "crosshair" : "default";
  const stageIsDraggable = tool === "select" || tool === "edit";

  useEffect(() => {
    const container = stageRef.current?.container();
    if (container) {
      container.style.cursor = stageCursor;
    }
  }, [stageCursor]);

  return (
    <div className="flex h-full flex-col">
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border-default bg-surface-elevated px-4 py-2">
        <div className="flex gap-1 rounded-lg bg-surface p-0.5">
          <button
            onClick={() => {
              setTool("select");
              setSelectedBedId(null);
              setSelectedPinId(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tool === "select"
                ? "bg-surface-elevated text-text-heading shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
              </svg>
              <span className="hidden sm:inline">Ansehen</span>
            </span>
          </button>
          <button
            onClick={() => {
              setTool("edit");
              setSelectedPinId(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tool === "edit"
                ? "bg-surface-elevated text-text-heading shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span className="hidden sm:inline">Bearbeiten</span>
            </span>
          </button>
          <button
            onClick={() => {
              setTool("draw");
              setSelectedBedId(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tool === "draw"
                ? "bg-surface-elevated text-text-heading shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              <span className="hidden sm:inline">Beet</span>
            </span>
          </button>
          <button
            onClick={() => {
              setTool("pin");
              setSelectedBedId(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tool === "pin"
                ? "bg-surface-elevated text-text-heading shadow-sm"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <circle cx="12" cy="12" r="7" />
                <path d="M12 5v2M12 17v2M5 12h2M17 12h2" />
              </svg>
              <span className="hidden sm:inline">Pflanze</span>
            </span>
          </button>
        </div>

        <div className="h-5 w-px bg-surface-muted" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="rounded-md px-2 py-1.5 text-sm font-bold text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
            aria-label="Verkleinern"
          >−</button>
          <button
            onClick={handleFitView}
            className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface hover:text-text-primary transition-colors tabular-nums"
            aria-label="Ansicht zurücksetzen"
            title="Ansicht zurücksetzen"
          >
            {Math.round(displayScale * 100)} %
          </button>
          <button
            onClick={handleZoomIn}
            className="rounded-md px-2 py-1.5 text-sm font-bold text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
            aria-label="Vergrößern"
          >+</button>
        </div>

        <div className="h-5 w-px bg-surface-muted" />

        <span className="text-xs text-text-muted">1 Feld = 50 cm</span>

        {tool === "draw" && (
          <span className="text-xs font-medium text-text-heading">
            Auf dem Raster ziehen um ein Beet anzulegen
          </span>
        )}
        {tool === "pin" && (
          <span className="text-xs font-medium text-text-heading">
            Klicken um Pflanze zu platzieren · Klick auf Kreis entfernt ihn
          </span>
        )}
        {tool === "select" && (
          <span className="text-xs text-text-muted">
            Scrollen = Zoom · Ziehen = Verschieben · Klick auf Pflanze = Pflanzenseite
          </span>
        )}
        {tool === "edit" && (
          <span className="text-xs text-text-muted">
            Beete und Pflanzen ziehen zum Verschieben · Klick zum Bearbeiten
          </span>
        )}

        {selectedBed && tool === "select" && (
          <>
            <div className="h-5 w-px bg-surface-muted" />
            <span className="text-sm font-medium text-text-heading">
              {selectedBed.name}
            </span>
          </>
        )}
      </div>

      {/* ── Canvas area ── */}
      <div className="relative flex-1 overflow-hidden bg-surface">
        <div
          ref={containerRef}
          className="h-full w-full"
          style={{
            cursor: stageCursor,
            userSelect: tool === "draw" ? "none" : undefined,
          }}
        >
          <Stage
            ref={stageRef}
            width={stageSize.width}
            height={stageSize.height}
            // Cap pixel ratio at 2 — on 3x Android devices this halves the GPU work
            // while keeping the map perfectly sharp for a garden overview
            pixelRatio={Math.min(window.devicePixelRatio, 2)}
            draggable={stageIsDraggable}
            onWheel={handleWheel}
            onMouseDown={handleStageMouseDown}
            onMouseMove={tool === "draw" ? handleStageMouseMove : undefined as never}
            onMouseUp={handleStageMouseUp}
            onTouchStart={handleStageMouseDown}
            onTouchMove={tool === "draw" ? handleStageMouseMove : undefined as never}
            onTouchEnd={handleStageMouseUp}
            onDragEnd={(e) => {
              // Capture pan position so it can be saved to sessionStorage on unmount
              const stage = e.target.getStage();
              if (stage) {
                lastViewRef.current = {
                  scaleX: stage.scaleX(),
                  x: stage.x(),
                  y: stage.y(),
                };
              }
            }}
            onClick={(e) => {
              if (e.target === e.target.getStage()) {
                setSelectedBedId(null);
                setSelectedPinId(null);
              }
            }}
          >
            {/* Static layer — background + grid, no hit-testing */}
            <Layer listening={false}>
              <Rect
                x={0}
                y={0}
                width={GRID_COLS * CELL_SIZE}
                height={GRID_ROWS * CELL_SIZE}
                fill="#FDF6EC"
              />
              <GridLines cols={GRID_COLS} rows={GRID_ROWS} />
            </Layer>

            {/* Interactive layer — beds, pins, draw preview */}
            <Layer>
              {/* Garden beds */}
              {beds.map((bed) => (
                <BedGroup
                  key={bed.id}
                  bed={bed}
                  isSelected={bed.id === selectedBedId}
                  isDraggable={tool === "edit"}
                  plantings={allPlantings}
                  plants={plantsMap}
                  companionStatuses={allCompanionData.statuses.get(bed.id)}
                  onBedClick={handleBedClick}
                  onBedDragEnd={(id, gx, gy) => { void handleBedDragEnd(id, gx, gy); }}
                  onTransformEnd={(id, node) => { void handleTransformEnd(id, node); }}
                  onTokenHover={handleTokenHover}
                  onTokenLeave={handleTokenLeave}
                />
              ))}

              {/* Plant pins (free-standing circles) */}
              <PlantPinLayer
                pins={pins}
                plants={plantsMap}
                hoveredPinId={hoveredPinId}
                selectedPinId={selectedPinId}
                editMode={tool === "edit"}
                onPinClick={handlePinClick}
                onPinHover={setHoveredPinId}
                onPinLeave={() => setHoveredPinId(null)}
                onPinDragEnd={handlePinDragEnd}
              />

              {/* Drawing preview rectangle */}
              {drawRect && isDrawing && (
                <Rect
                  x={Math.min(drawRect.startX, drawRect.endX)}
                  y={Math.min(drawRect.startY, drawRect.endY)}
                  width={Math.abs(drawRect.endX - drawRect.startX)}
                  height={Math.abs(drawRect.endY - drawRect.startY)}
                  fill="#7dbf4e"
                  opacity={0.3}
                  stroke="#2D5016"
                  strokeWidth={2}
                  dash={[6, 3]}
                  listening={false}
                />
              )}
            </Layer>
          </Stage>
        </div>

        {/* Version badge */}
        <span className="pointer-events-none absolute bottom-2 right-2 z-10 rounded bg-black/20 px-1.5 py-0.5 text-[10px] text-white/60 select-none">
          v{__APP_VERSION__}
        </span>

        {/* Companion tooltip overlay */}
        {tooltip && (
          <div
            className="pointer-events-none absolute z-30 max-w-48 rounded-md bg-soil-800 px-2.5 py-1.5 text-xs text-white shadow-lg"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 8,
            }}
          >
            {tooltip.messages.map((msg, i) => (
              <div key={i}>{msg}</div>
            ))}
          </div>
        )}

        {/* Pin edit panel (edit mode) */}
        {tool === "edit" && selectedPinId && (() => {
          const pin = pins.find((p) => p.id === selectedPinId);
          if (!pin) return null;
          const plant = plantsMap.get(pin.plantInstanceId);
          const stage = stageRef.current;
          const scale = stage?.scaleX() ?? displayScale;
          const ox = stage?.x() ?? 0;
          const oy = stage?.y() ?? 0;
          const sx = (pin.gridX + 0.5) * CELL_SIZE * scale + ox;
          const sy = (pin.gridY + 0.5) * CELL_SIZE * scale + oy;
          const panelLeft = Math.min(sx + 12, stageSize.width - 240);
          const panelTop = Math.max(8, sy - 70);
          return (
            <div
              className="absolute z-30 w-56 rounded-xl border border-border-default bg-surface-elevated p-3 shadow-xl"
              style={{ left: panelLeft, top: panelTop }}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-sm font-semibold text-text-heading leading-tight truncate">
                  {plant ? (plant.nickname ?? plant.species) : "Unbekannte Pflanze"}
                </p>
                <button
                  onClick={() => setSelectedPinId(null)}
                  className="shrink-0 rounded p-0.5 text-text-muted hover:bg-surface"
                  aria-label="Schließen"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mb-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-text-secondary">Durchmesser</span>
                  <span className="text-xs font-medium tabular-nums">{(pin.sizeM ?? 0.5).toFixed(1)} m</span>
                </div>
                <input
                  type="range"
                  min={0.1} max={6} step={0.1}
                  defaultValue={pin.sizeM ?? 0.5}
                  onChange={(e) => handlePinSizeChange(pin.id, Number(e.target.value))}
                  className="w-full accent-green-600"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void navigate(`/plants/${pin.plantInstanceId}`)}
                  className="flex-1 rounded-lg bg-primary px-2 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
                >
                  Pflanzenseite
                </button>
                <button
                  onClick={() => {
                    void gardenMapPinRepository.softDelete(pin.id);
                    setSelectedPinId(null);
                  }}
                  className="rounded-lg px-2 py-1.5 text-xs font-medium text-terracotta-600 hover:bg-terracotta-400/10 transition-colors"
                >
                  Entfernen
                </button>
              </div>
            </div>
          );
        })()}

        {/* Bed detail sidebar */}
        {selectedBed && (
          <BedDetailPanel
            bed={selectedBed}
            plantings={allPlantings}
            plants={plantsMap}
            hasActiveSeason={activeSeason != null}
            companionReport={
              allCompanionData.reports.get(selectedBed.id) ?? {
                goodPairings: [],
                badPairings: [],
                suggestions: [],
              }
            }
            companionStatuses={
              allCompanionData.statuses.get(selectedBed.id) ?? new Map()
            }
            onClose={() => setSelectedBedId(null)}
            onDelete={() => void handleDeleteBed()}
            onQuickLog={() =>
              navigate(`/quick-log?bedId=${selectedBed.id}`)
            }
            onAssignPlant={() => setShowAssignPlant(true)}
            onRemovePlant={(id) => void handleRemovePlant(id)}
            onUpdate={(changes) => void handleUpdateBed(changes)}
          />
        )}
      </div>

      {/* New bed modal */}
      {showNewBedModal && (
        <NewBedModal
          onSave={(data) => void handleCreateBed(data)}
          onCancel={() => {
            setShowNewBedModal(false);
            setPendingDraw(null);
          }}
        />
      )}

      {/* Assign plant modal */}
      {showAssignPlant && selectedBed && (
        <AssignPlantModal
          bed={selectedBed}
          plantings={allPlantings}
          plants={rawPlants}
          onAssign={(plantId) => void handleAssignPlant(plantId)}
          onClose={() => setShowAssignPlant(false)}
        />
      )}

      {/* Pin plant picker */}
      {showPinPicker && (
        <PinPlantPickerModal
          plants={rawPlants}
          onPick={(plantId, sizeM) => void handleCreatePin(plantId, sizeM)}
          onClose={() => {
            pendingPinPosRef.current = null;
            setShowPinPicker(false);
          }}
        />
      )}
    </div>
  );
}
