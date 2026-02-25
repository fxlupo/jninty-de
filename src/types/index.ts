// ─── Enums ───

export type PlantType =
  | "vegetable"
  | "herb"
  | "flower"
  | "ornamental"
  | "fruit_tree"
  | "berry"
  | "other";

export type PlantSource = "seed" | "nursery" | "cutting" | "gift" | "unknown";

export type PlantStatus =
  | "active"
  | "dormant"
  | "harvested"
  | "removed"
  | "dead";

export type ActivityType =
  | "watering"
  | "fertilizing"
  | "pruning"
  | "pest"
  | "disease"
  | "harvest"
  | "transplant"
  | "milestone"
  | "general";

export type MilestoneType =
  | "first_sprout"
  | "first_flower"
  | "first_fruit"
  | "peak_harvest"
  | "other";

export type TaskPriority = "urgent" | "normal" | "low";

export type RecurrenceType = "daily" | "weekly" | "monthly" | "custom";

export type BedType =
  | "vegetable_bed"
  | "flower_bed"
  | "fruit_area"
  | "herb_garden"
  | "container"
  | "other";

export type SunExposure = "full_sun" | "partial_shade" | "full_shade";

// ─── Base Entity ───

export type BaseEntity = {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
};

// ─── Plant Instance (flat model for Phase 1 — no Season/Planting split) ───

export type PlantInstance = BaseEntity & {
  nickname?: string;
  species: string;
  variety?: string;
  type: PlantType;
  isPerennial: boolean;
  dateAcquired?: string;
  source: PlantSource;
  seedId?: string;
  status: PlantStatus;
  tags: string[];
  careNotes?: string;
};

// ─── Journal Entry ───

export type WeatherSnapshot = {
  tempC?: number;
  humidity?: number;
  conditions?: string;
};

export type JournalEntry = BaseEntity & {
  plantInstanceId?: string;
  bedId?: string;
  seasonId?: string; // optional/unused in Phase 1
  activityType: ActivityType;
  title?: string;
  body: string;
  photoIds: string[];
  isMilestone: boolean;
  milestoneType?: MilestoneType;
  harvestWeight?: number;
  weatherSnapshot?: WeatherSnapshot;
};

// ─── Photo ───

export type Photo = BaseEntity & {
  thumbnailBlob: Blob;
  displayBlob?: Blob;
  originalStored: boolean;
  caption?: string;
  width?: number;
  height?: number;
};

// ─── Task (manual only for Phase 1 — no ruleId/generatedAt/dismissedAt) ───

export type Task = BaseEntity & {
  title: string;
  description?: string;
  plantInstanceId?: string;
  bedId?: string;
  dueDate: string;
  priority: TaskPriority;
  isCompleted: boolean;
  completedAt?: string;
  recurrence?: {
    type: RecurrenceType;
    interval: number;
  };
};

// ─── Garden Bed (minimal for Phase 1 — no grid position fields) ───

export type GardenBed = BaseEntity & {
  name: string;
  type: BedType;
};

// ─── Settings ───

export type Settings = {
  growingZone: string;
  lastFrostDate: string;
  firstFrostDate: string;
  temperatureUnit: "fahrenheit" | "celsius";
  gardenName?: string;
  theme: "light" | "dark" | "auto";
  keepOriginalPhotos: boolean;
  dbSchemaVersion: number;
  exportVersion: number;
};
