import { sql } from "drizzle-orm";
import {
  customType,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Text column that stores ISO-8601 strings but accepts/returns JavaScript
 * Date objects. Required because Better-Auth passes Date objects for
 * timestamp fields and Drizzle's plain text() column has no Date converter.
 */
const dateText = customType<{ data: Date; driverData: string }>({
  dataType() {
    return "text";
  },
  toDriver(value) {
    return value instanceof Date ? value.toISOString() : String(value);
  },
  fromDriver(value) {
    return new Date(value);
  },
});

// ─── Better-Auth tables ───────────────────────────────────────────────────────
// Better-Auth sends Date objects for timestamp fields and booleans for flags.
// Use { mode: 'date' } on text columns so Drizzle converts Date ↔ ISO string,
// and integer { mode: 'boolean' } converts boolean ↔ 0/1.

export const users = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: dateText("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: dateText("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: dateText("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: dateText("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: dateText("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: dateText("access_token_expires_at"),
  refreshTokenExpiresAt: dateText("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: dateText("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: dateText("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const verifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: dateText("expires_at").notNull(),
  createdAt: dateText("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: dateText("updated_at").default(sql`CURRENT_TIMESTAMP`),
});

// ─── App entity tables ────────────────────────────────────────────────────────
// All entity tables include these base columns (matching baseEntitySchema).

export const plants = sqliteTable("plant", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  userId: text("user_id").notNull(),
  // Plant fields
  species: text("species").notNull(),
  nickname: text("nickname"),
  variety: text("variety"),
  type: text("type").notNull(),
  isPerennial: integer("is_perennial", { mode: "boolean" }).notNull(),
  source: text("source").notNull(),
  seedId: text("seed_id"),
  status: text("status").notNull(),
  dateAcquired: text("date_acquired"),
  careNotes: text("care_notes"),
  purchasePrice: real("purchase_price"),
  purchaseStore: text("purchase_store"),
  tags: text("tags", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  photoIds: text("photo_ids", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
});

export const photos = sqliteTable("photo", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  userId: text("user_id").notNull(),
  // Photo fields — URLs point to files in data/uploads/
  thumbnailUrl: text("thumbnail_url").notNull(),
  displayUrl: text("display_url"),
  originalStored: integer("original_stored", { mode: "boolean" })
    .notNull()
    .default(false),
  caption: text("caption"),
  takenAt: text("taken_at"),
  width: integer("width"),
  height: integer("height"),
});

export const journalEntries = sqliteTable("journal_entry", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  userId: text("user_id").notNull(),
  // Journal fields
  plantInstanceId: text("plant_instance_id"),
  bedId: text("bed_id"),
  seasonId: text("season_id").notNull(),
  activityType: text("activity_type").notNull(),
  title: text("title"),
  body: text("body").notNull(),
  photoIds: text("photo_ids", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'`),
  isMilestone: integer("is_milestone", { mode: "boolean" }).notNull(),
  milestoneType: text("milestone_type"),
  harvestWeight: real("harvest_weight"),
  weatherSnapshot: text("weather_snapshot", { mode: "json" }).$type<{
    tempC?: number;
    humidity?: number;
    conditions?: string;
  } | null>(),
});

export const tasks = sqliteTable("task", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  userId: text("user_id").notNull(),
  // Task fields
  title: text("title").notNull(),
  description: text("description"),
  plantInstanceId: text("plant_instance_id"),
  bedId: text("bed_id"),
  seasonId: text("season_id"),
  dueDate: text("due_date").notNull(),
  priority: text("priority").notNull(),
  isCompleted: integer("is_completed", { mode: "boolean" }).notNull(),
  completedAt: text("completed_at"),
  isAutoGenerated: integer("is_auto_generated", { mode: "boolean" }),
  ruleId: text("rule_id"),
  generatedAt: text("generated_at"),
  dismissedAt: text("dismissed_at"),
  recurrence: text("recurrence", { mode: "json" }).$type<{
    type: string;
    interval: number;
  } | null>(),
});

export const expenses = sqliteTable("expense", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  userId: text("user_id").notNull(),
  // Expense fields
  name: text("name").notNull(),
  category: text("category").notNull(),
  amount: real("amount").notNull(),
  store: text("store"),
  date: text("date").notNull(),
  seasonId: text("season_id"),
  notes: text("notes"),
});

export const seeds = sqliteTable("seed", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  userId: text("user_id").notNull(),
  // Seed fields
  name: text("name").notNull(),
  species: text("species").notNull(),
  variety: text("variety"),
  brand: text("brand"),
  supplier: text("supplier"),
  quantityRemaining: real("quantity_remaining").notNull(),
  quantityUnit: text("quantity_unit").notNull(),
  purchaseDate: text("purchase_date"),
  expiryDate: text("expiry_date"),
  germinationRate: integer("germination_rate"),
  cost: real("cost"),
  purchaseStore: text("purchase_store"),
  storageLocation: text("storage_location"),
  notes: text("notes"),
});

export const seasons = sqliteTable("season", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  userId: text("user_id").notNull(),
  // Season fields
  name: text("name").notNull(),
  year: integer("year").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
});

export const gardenBeds = sqliteTable("garden_bed", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  userId: text("user_id").notNull(),
  // Garden bed fields
  name: text("name").notNull(),
  type: text("type").notNull(),
  gridX: real("grid_x").notNull(),
  gridY: real("grid_y").notNull(),
  gridWidth: real("grid_width").notNull(),
  gridHeight: real("grid_height").notNull(),
  shape: text("shape").notNull(),
  color: text("color").notNull(),
  sunExposure: text("sun_exposure"),
  soilType: text("soil_type"),
  irrigationMethod: text("irrigation_method"),
  notes: text("notes"),
});

export const taskRules = sqliteTable("task_rule", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  userId: text("user_id").notNull(),
  // TaskRule fields — complex objects stored as JSON
  appliesTo: text("applies_to", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  trigger: text("trigger", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  task: text("task_def", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  isBuiltIn: integer("is_built_in", { mode: "boolean" }).notNull(),
});

export const plantings = sqliteTable("planting", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  userId: text("user_id").notNull(),
  // Planting fields
  plantInstanceId: text("plant_instance_id").notNull(),
  seasonId: text("season_id").notNull(),
  bedId: text("bed_id"),
  datePlanted: text("date_planted"),
  dateRemoved: text("date_removed"),
  outcome: text("outcome"),
  notes: text("notes"),
});

export const plantingSchedules = sqliteTable("planting_schedule", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  userId: text("user_id").notNull(),
  // PlantingSchedule fields
  cropId: text("crop_id").notNull(),
  varietyId: text("variety_id").notNull(),
  cropSource: text("crop_source").notNull(),
  cropName: text("crop_name").notNull(),
  varietyName: text("variety_name").notNull(),
  bedId: text("bed_id"),
  bedName: text("bed_name"),
  anchorDate: text("anchor_date").notNull(),
  direction: text("direction").notNull(),
  seasonId: text("season_id"),
  successionGroupId: text("succession_group_id"),
  successionIndex: integer("succession_index"),
  seedStartDate: text("seed_start_date"),
  bedPrepDate: text("bed_prep_date"),
  transplantDate: text("transplant_date"),
  cultivateStartDate: text("cultivate_start_date"),
  harvestStartDate: text("harvest_start_date").notNull(),
  harvestEndDate: text("harvest_end_date").notNull(),
  status: text("status").notNull(),
  notes: text("notes"),
});

export const scheduleTasks = sqliteTable("schedule_task", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  userId: text("user_id").notNull(),
  // ScheduleTask fields
  plantingScheduleId: text("planting_schedule_id").notNull(),
  taskType: text("task_type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  cropName: text("crop_name").notNull(),
  varietyName: text("variety_name").notNull(),
  bedId: text("bed_id"),
  bedName: text("bed_name"),
  scheduledDate: text("scheduled_date").notNull(),
  originalDate: text("original_date").notNull(),
  isCompleted: integer("is_completed", { mode: "boolean" }).notNull(),
  completedDate: text("completed_date"),
  completedAt: text("completed_at"),
  sequenceOrder: integer("sequence_order").notNull(),
});

export const userPlantKnowledge = sqliteTable("user_plant_knowledge", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"),
  userId: text("user_id").notNull(),
  // PlantKnowledge fields
  species: text("species").notNull(),
  variety: text("variety"),
  commonName: text("common_name").notNull(),
  plantType: text("plant_type").notNull(),
  isPerennial: integer("is_perennial", { mode: "boolean" }).notNull(),
  cropGroup: text("crop_group").notNull(),
  family: text("family"),
  indoorStartWeeksBeforeLastFrost: integer("indoor_start_weeks_before_last_frost"),
  transplantWeeksAfterLastFrost: integer("transplant_weeks_after_last_frost"),
  directSowWeeksBeforeLastFrost: integer("direct_sow_weeks_before_last_frost"),
  directSowWeeksAfterLastFrost: integer("direct_sow_weeks_after_last_frost"),
  daysToGermination: integer("days_to_germination"),
  daysToMaturity: integer("days_to_maturity"),
  spacingInches: integer("spacing_inches"),
  sunNeeds: text("sun_needs").notNull(),
  waterNeeds: text("water_needs").notNull(),
  soilPreference: text("soil_preference"),
  matureHeightInches: integer("mature_height_inches"),
  matureSpreadInches: integer("mature_spread_inches"),
  growthRate: text("growth_rate"),
  // Complex arrays stored as JSON
  scheduling: text("scheduling", { mode: "json" }).$type<Record<string, unknown> | null>(),
  goodCompanions: text("good_companions", { mode: "json" }).$type<string[] | null>(),
  badCompanions: text("bad_companions", { mode: "json" }).$type<string[] | null>(),
  commonPests: text("common_pests", { mode: "json" }).$type<string[] | null>(),
  commonDiseases: text("common_diseases", { mode: "json" }).$type<string[] | null>(),
});

// ─── Settings (per-user singleton, no baseEntity base) ───────────────────────

export const settings = sqliteTable("settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  updatedAt: text("updated_at").notNull(),
  growingZone: text("growing_zone").notNull().default("7a"),
  lastFrostDate: text("last_frost_date").notNull().default("2026-04-15"),
  firstFrostDate: text("first_frost_date").notNull().default("2026-10-15"),
  gridUnit: text("grid_unit").notNull().default("meters"),
  temperatureUnit: text("temperature_unit").notNull().default("celsius"),
  gardenName: text("garden_name"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  theme: text("theme").notNull().default("auto"),
  highContrast: integer("high_contrast", { mode: "boolean" })
    .notNull()
    .default(false),
  fontSize: text("font_size").notNull().default("normal"),
  keepOriginalPhotos: integer("keep_original_photos", { mode: "boolean" })
    .notNull()
    .default(false),
  lastExportDate: text("last_export_date"),
  dbSchemaVersion: integer("db_schema_version").notNull().default(1),
  exportVersion: integer("export_version").notNull().default(1),
});
