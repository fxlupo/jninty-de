# Unified Plant Database

**Date:** 2026-03-05
**Status:** Approved

## Problem

The app has two separate plant data sources that describe the same plants:

- **CropDB** (`src/data/cropdb/*.json`) — 30 crops, 73 varieties. Drives the scheduling engine with day-based timing (daysToTransplant, harvestWindowDays, bedPrepLeadDays).
- **Plant Knowledge DB** (`data/plants/*.json`) — 71 entries. Drives the planting calendar, knowledge browser, companion analysis, and seed-to-plant creation with frost-relative timing and ecological data.

This causes: data duplication with conflicts (e.g., Beefsteak Tomato daysToMaturity is 85 in CropDB vs 80 in PlantKB), inconsistent crop lists across features, two parallel custom-entry systems, and the seed bank can't tap into either list for autocomplete.

## Decision

**Option C: CropDB becomes a scheduling extension of PlantKB.** PlantKB is the single source of plant identity. Scheduling-specific fields move into an optional `scheduling` block on PlantKB entries. CropDB is deleted as a separate concept. Big-bang migration — all consumers updated in one pass.

## Unified Schema

```typescript
{
  // Identity
  species: string                // "Solanum lycopersicum"
  variety?: string               // "Cherry"
  commonName: string             // "Cherry Tomato"
  plantType: PlantType           // "vegetable" | "herb" | "flower" | "fruit"
  isPerennial: boolean

  // Hierarchy (NEW)
  cropGroup: string              // "tomato" — groups varieties together
  family?: string                // "Solanaceae" — botanical family

  // Frost-relative timing (canonical)
  indoorStartWeeksBeforeLastFrost?: number
  transplantWeeksAfterLastFrost?: number
  directSowWeeksBeforeLastFrost?: number
  directSowWeeksAfterLastFrost?: number
  daysToGermination?: number
  daysToMaturity?: number

  // Care
  spacingInches?: number
  sunNeeds: SunExposure
  waterNeeds: WaterNeeds
  soilPreference?: string
  matureHeightInches?: number
  matureSpreadInches?: number
  growthRate?: GrowthRate

  // Companions & issues
  goodCompanions?: string[]
  badCompanions?: string[]
  commonPests?: string[]
  commonDiseases?: string[]

  // Scheduling extension (NEW — optional)
  scheduling?: {
    seedingDepthInches: number
    rowSpacingInches: number
    harvestWindowDays: number
    bedPrepLeadDays: number
    successionIntervalDays: number | null
    directSow: boolean
    indoorStart: boolean
    frostHardy: boolean
    notes?: string
  }
}
```

### Key decisions

- `cropGroup` provides explicit hierarchy — CropPicker groups entries by this field.
- Frost-relative weeks are the canonical timing format. The scheduling engine derives absolute days at runtime (`weeks * 7`).
- `daysToTransplant` from CropDB is dropped — derived from `indoorStartWeeksBeforeLastFrost * 7`.
- Duration-based fields (`harvestWindowDays`, `bedPrepLeadDays`, `successionIntervalDays`) stay as absolute days in the scheduling block since they're durations, not calendar-relative dates.
- All CropDB fields are preserved (including previously unused ones like `frostHardy`, `seedingDepthInches`, `rowSpacingInches`, `successionIntervalDays`, `notes`) — they'll be surfaced on the Knowledge Detail page.

## Data Migration

The four CropDB JSON files merge into the four PlantKB JSON files. After migration, `src/data/cropdb/` is deleted.

### Merge rules

- **Crops in both (30):** merge CropDB scheduling fields into existing PlantKB entry, add `cropGroup` and `family`.
- **PlantKB-only (41):** add `cropGroup` field, no scheduling block.
- **Data conflicts:** prefer PlantKB values for shared fields (`daysToMaturity`, `spacingInches`) since PlantKB is Zod-validated and more curated.
- **Timing conversion:** CropDB `daysToTransplant` → `Math.round(daysToTransplant / 7)` → `indoorStartWeeksBeforeLastFrost` where PlantKB doesn't already have the value.

### CropGroup assignment

- Entries with a CropDB counterpart: use the CropDB `id` (e.g., `"tomato"`, `"pepper"`).
- PlantKB-only entries: derive from common name lowercased (e.g., `"cauliflower"`, `"eggplant"`).
- Perennials/trees with no varieties: use their own group (e.g., `"apple-tree"`).

### Example merged entry

```json
{
  "species": "Solanum lycopersicum",
  "variety": "Cherry",
  "commonName": "Cherry Tomato",
  "plantType": "vegetable",
  "isPerennial": false,
  "cropGroup": "tomato",
  "family": "Solanaceae",
  "indoorStartWeeksBeforeLastFrost": 6,
  "transplantWeeksAfterLastFrost": 2,
  "daysToGermination": 7,
  "daysToMaturity": 65,
  "spacingInches": 24,
  "sunNeeds": "full_sun",
  "waterNeeds": "high",
  "soilPreference": "Well-drained, rich loam, slightly acidic (pH 6.0-6.8)",
  "matureHeightInches": 60,
  "matureSpreadInches": 24,
  "growthRate": "fast",
  "goodCompanions": ["basil", "carrot", "parsley", "marigold"],
  "badCompanions": ["fennel", "brassicas", "dill", "potato"],
  "commonPests": ["tomato hornworm", "aphids", "whiteflies", "flea beetles"],
  "commonDiseases": ["early blight", "late blight", "blossom end rot", "fusarium wilt"],
  "scheduling": {
    "seedingDepthInches": 0.25,
    "rowSpacingInches": 36,
    "harvestWindowDays": 60,
    "bedPrepLeadDays": 14,
    "successionIntervalDays": null,
    "directSow": false,
    "indoorStart": true,
    "frostHardy": false,
    "notes": "Indeterminate. Extremely productive..."
  }
}
```

## Service Layer Changes

### Expanded `knowledgeBase.ts` API

```
// Existing (unchanged)
loadKnowledgeBase()              → PlantKnowledge[]
getBySpecies(species)            → PlantKnowledge | undefined
searchKnowledge(query)           → PlantKnowledge[]
getCompanions(species)           → { good, bad }
loadAllKnowledgeItems(user)      → KnowledgeBaseItem[]
findKnowledgeItemById(id, user)  → KnowledgeBaseItem | undefined

// New — replaces CropDB loader functions
getCropGroups()                  → Map<string, PlantKnowledge[]>
getCropGroup(groupId)            → PlantKnowledge[]
getSchedulable()                 → PlantKnowledge[]  // entries with scheduling block
getCategories()                  → string[]

// New — derived timing for scheduling engine
getSchedulingDays(entry, lastFrostDate) → {
  transplantDays: number
  sowDate: Date
  transplantDate: Date
  harvestStartDate: Date
  harvestEndDate: Date
  bedPrepDate: Date
}
```

### Files deleted

- `src/data/cropdb/index.ts`
- `src/data/cropdb/cropdb.types.ts`
- `src/data/cropdb/*.json` (4 files)
- `src/services/cropDBSearch.ts`
- `src/hooks/useCropDB.ts`

### Consumer migration

| File | Current import | Changes to |
|---|---|---|
| `CropPicker.tsx` | `useCropDB()` | `getCropGroups()`, filter to `getSchedulable()` |
| `VarietySelector.tsx` | `getCropById()` | `getCropGroup(groupId)` |
| `StepSelectCrop.tsx` | `useCropDB()` | same as CropPicker |
| `StepSelectVariety.tsx` | `getCropById()`, `CropVariety` | `getCropGroup()`, `PlantKnowledge` |
| `StartingFlowWizard.tsx` | `getVarietyById()` | lookup by species+variety from knowledgeBase |
| `schedulingService.ts` | `CropVariety` type | `PlantKnowledge` + `getSchedulingDays()` |
| `useScheduling.ts` | `getVarietyById()` | knowledgeBase lookup |
| `PlantingCalendarPage.tsx` | `getBySpecies()` | unchanged |
| `KnowledgeDetailPage.tsx` | `findKnowledgeItemById()` | unchanged, template updated to show scheduling fields |
| `SeedDetailPage.tsx` | `getBySpecies()` | unchanged |
| `SeedFormPage.tsx` | plain text inputs | add autocomplete from `searchKnowledge()` |

### Custom entries

`UserPlantKnowledge` schema gets `cropGroup`, `family`, and `scheduling` as optional fields. The `CustomCrop` PouchDB type from `useCropDB` is dropped — users create custom entries through the unified `UserPlantKnowledge` path.

## Seed Form Autocomplete

- **Species field:** typeahead searching unified PlantKB via `searchKnowledge()`. Results grouped by `cropGroup`. Selecting a match fills the species string. Free-text still allowed.
- **Variety field:** when species matches a `cropGroup` with multiple entries, show known varieties as suggestions. Free-text still allowed.
- No hard lock-in — users aren't blocked if their plant isn't in the DB.

## Knowledge Detail Page Updates

### New sections (only render when `scheduling` block exists)

- **Planting Method** — `directSow`, `indoorStart`, `frostHardy` as badges
- **Seeding & Spacing** — `seedingDepthInches`, `rowSpacingInches`
- **Harvest** — `harvestWindowDays`, `successionIntervalDays`
- **Prep** — `bedPrepLeadDays`
- **Notes** — `scheduling.notes`

### New for all entries

- **Family** badge near the top alongside `plantType`
- **Related varieties** section at the bottom — links to sibling entries via `getCropGroup()`

## Execution Order

### Step 1: Schema & Data

- Update `plantKnowledge.schema.ts` with `cropGroup`, `family`, `scheduling`
- Update `userPlantKnowledge.schema.ts` to match
- Write migration script to merge CropDB JSON into PlantKB JSON
- Validate merged data passes Zod schema
- Delete `src/data/cropdb/`

### Step 2: Service Layer

- Expand `knowledgeBase.ts` with new functions
- Delete `src/data/cropdb/index.ts`, `cropdb.types.ts`, `cropDBSearch.ts`, `useCropDB.ts`
- Update `knowledgeBaseTypes.ts`

### Step 3: Consumer Migration

- Update scheduling engine (`schedulingService.ts`, `useScheduling.ts`)
- Update crop picker components (`CropPicker.tsx`, `VarietySelector.tsx`)
- Update starting flow (`StepSelectCrop.tsx`, `StepSelectVariety.tsx`, `StartingFlowWizard.tsx`)
- Update `KnowledgeDetailPage.tsx` with scheduling sections
- Add autocomplete to `SeedFormPage.tsx`

### Step 4: Tests

- Update `knowledgeBase.test.ts` for new functions
- Update `plantKnowledge.schema.test.ts` for new fields
- Update/rewrite scheduling service tests
- Remove `src/data/cropdb/index.test.ts`
- Run full suite

### Risk mitigation

- Scheduling engine is highest-risk consumer — test `getSchedulingDays()` output against current CropDB values to verify week-to-day conversion produces equivalent results.
- Manual end-to-end test: CropPicker → schedule creation flow.
