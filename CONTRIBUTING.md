# Contributing to Jninty

Thank you for your interest in contributing to Jninty! This guide covers everything from setting up your dev environment to submitting pull requests.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Code Style](#code-style)
- [TypeScript Strictness](#typescript-strictness)
- [Running Tests](#running-tests)
- [Submitting Bug Reports](#submitting-bug-reports)
- [Proposing Features](#proposing-features)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Contributing Plant Data](#contributing-plant-data)
- [Labels](#labels)

## Development Setup

### Prerequisites

- Node.js 18+ (20 recommended)
- npm 9+
- Git

### Installation

```bash
git clone https://github.com/HapiCreative/jninty.git
cd jninty
npm install
npm run dev
```

The dev server starts at [http://localhost:5173](http://localhost:5173).

### Useful Commands

```bash
npm run dev          # Vite dev server with HMR
npm run build        # TypeScript type-check + production build
npm run preview      # Preview production build locally
npm run lint         # ESLint
npm run test         # Vitest (single run)
npm run test:watch   # Vitest (watch mode)
```

## Project Structure

```
src/
  pages/              Route-level page components
  components/         Shared UI components
  components/ui/      Primitives (Button, Card, Input, Badge, Toast, Skeleton)
  components/layout/  Layout (AppShell — sidebar + bottom nav)
  db/pouchdb/         PouchDB client, helpers, indexes
  db/pouchdb/repositories/  Per-entity data access functions
  db/search.ts        MiniSearch full-text index
  hooks/              Custom React hooks
  services/           Business logic (calendar, taskEngine, photoProcessor, exporter)
  validation/         Zod schemas for all entities
  types/              TypeScript type definitions
  constants/          Label and option constants
data/plants/          Community-contributed plant knowledge JSON
sync/                 Docker Compose + setup script for CouchDB sync
```

**Key patterns:**
- Route-level pages in `src/pages/`, shared components in `src/components/`
- Data access through repository functions in `src/db/pouchdb/repositories/`
- All entities have `id` (UUID), `version`, `createdAt`, `updatedAt`, `deletedAt`
- Documents are prefixed with a `docType` (e.g. `plant:uuid`) for type isolation

## Code Style

- **Linting:** ESLint — run `npm run lint` before committing
- **Formatting:** Follow the existing code style in the repository
- **Styling:** Tailwind CSS v4, configured via `@theme` block in `src/index.css` (no `tailwind.config.ts`)
- **Imports:** Use relative imports within modules, avoid barrel files

## TypeScript Strictness

The project uses strict TypeScript settings (`tsconfig.app.json`):

- `strict: true`
- `noUncheckedIndexedAccess: true` — array/object index access returns `T | undefined`
- `exactOptionalPropertyTypes: true` — optional properties cannot be assigned `undefined` unless the type explicitly includes it

These settings catch real bugs. Do not weaken them. If you're unsure how to handle a type, check existing code for patterns.

## Running Tests

```bash
npm run test              # Run all tests once
npm run test:watch        # Watch mode
npx vitest run src/path/to/file.test.ts  # Run a single test file
```

Tests use Vitest with Testing Library and jsdom. If you're adding a new feature or fixing a bug, please include tests.

## Submitting Bug Reports

Use the [Bug Report template](https://github.com/HapiCreative/jninty/issues/new?template=bug_report.md) and include:

1. Clear description of the bug
2. Steps to reproduce
3. Expected vs actual behavior
4. Your environment (browser, OS, PWA vs browser tab)
5. Screenshots or console errors if available

## Proposing Features

Use the [Feature Request template](https://github.com/HapiCreative/jninty/issues/new?template=feature_request.md). Before proposing, check:

- The [design document](docs/plans/Jninty-Design-v1.md) — your idea may already be planned for a future phase
- Existing issues — someone may have already proposed it

Feature proposals should explain the problem being solved, not just the solution.

## Pull Request Guidelines

1. **Fork and branch** — Create a feature branch from `main`
2. **Keep it focused** — One logical change per PR
3. **Test your changes** — Run `npm run lint`, `npm run test`, and `npm run build` before submitting
4. **Describe the change** — Use the [PR template](.github/pull_request_template.md)
5. **Include screenshots** for UI changes
6. **Link related issues** — Use "Closes #123" in the PR description

## Contributing Plant Data

Plant data contributions are welcome and don't require writing application code! Built-in plant data lives in JSON files under `data/plants/`:

| File | Contents |
|------|----------|
| `data/plants/vegetables.json` | Vegetables |
| `data/plants/herbs.json` | Herbs |
| `data/plants/fruits.json` | Fruits & berries |
| `data/plants/flowers.json` | Flowers & ornamentals |

Each file contains an array of plant knowledge entries validated against a strict Zod schema at build time.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `species` | string | Scientific/Latin name (e.g. `"Solanum lycopersicum"`) |
| `commonName` | string | Common name (e.g. `"Tomato"`) |
| `plantType` | enum | One of: `vegetable`, `herb`, `flower`, `ornamental`, `fruit_tree`, `berry`, `other` |
| `isPerennial` | boolean | `true` if the plant is perennial |
| `sunNeeds` | enum | One of: `full_sun`, `partial_shade`, `full_shade` |
| `waterNeeds` | enum | One of: `low`, `moderate`, `high` |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `variety` | string | Cultivar or variety name |
| `soilPreference` | string | Preferred soil type |
| `growthRate` | enum | `slow`, `moderate`, or `fast` |
| `spacingInches` | integer | Plant spacing in inches |
| `matureHeightInches` | integer | Mature height in inches |
| `matureSpreadInches` | integer | Mature spread in inches |
| `indoorStartWeeksBeforeLastFrost` | integer | Weeks before last frost to start indoors |
| `transplantWeeksAfterLastFrost` | integer | Weeks after last frost to transplant |
| `directSowWeeksBeforeLastFrost` | integer | Weeks before last frost to direct sow |
| `directSowWeeksAfterLastFrost` | integer | Weeks after last frost to direct sow |
| `daysToGermination` | integer (>0) | Days to germination |
| `daysToMaturity` | integer (>0) | Days to maturity |
| `goodCompanions` | string[] | List of good companion plant common names |
| `badCompanions` | string[] | List of bad companion plant common names |
| `commonPests` | string[] | List of common pests |
| `commonDiseases` | string[] | List of common diseases |

### Example Entries

**Minimal entry:**

```json
{
  "species": "Ocimum basilicum",
  "commonName": "Basil",
  "plantType": "herb",
  "isPerennial": false,
  "sunNeeds": "full_sun",
  "waterNeeds": "moderate"
}
```

**Full entry:**

```json
{
  "species": "Solanum lycopersicum",
  "variety": "Roma",
  "commonName": "Roma Tomato",
  "plantType": "vegetable",
  "isPerennial": false,
  "sunNeeds": "full_sun",
  "waterNeeds": "moderate",
  "soilPreference": "Well-drained, slightly acidic (pH 6.0-6.8)",
  "growthRate": "moderate",
  "spacingInches": 24,
  "matureHeightInches": 48,
  "matureSpreadInches": 24,
  "indoorStartWeeksBeforeLastFrost": 6,
  "transplantWeeksAfterLastFrost": 2,
  "daysToGermination": 7,
  "daysToMaturity": 75,
  "goodCompanions": ["Basil", "Carrots", "Marigold", "Parsley"],
  "badCompanions": ["Brassicas", "Fennel", "Dill"],
  "commonPests": ["Aphids", "Tomato Hornworm", "Whiteflies"],
  "commonDiseases": ["Blight", "Fusarium Wilt", "Blossom End Rot"]
}
```

### Plant Data Guidelines

- Use accepted scientific names for the `species` field
- Use title case for `commonName` (e.g. "Cherry Tomato", not "cherry tomato")
- Companion plant names should use common names matching other entries' `commonName` where possible
- Cite your data sources in the PR description (seed catalogs, university extension guides, etc.)
- Timing data (weeks before/after frost) should reflect general temperate-zone guidance
- One entry per species/variety combination — don't duplicate
- Run `npm run test` to verify entries pass schema validation

## Labels

The project uses these labels for issue triage:

| Label | Description |
|-------|-------------|
| `bug` | Something isn't working |
| `enhancement` | New feature or improvement |
| `plant-data` | Plant knowledge base contribution |
| `good-first-issue` | Good for newcomers |
| `documentation` | Documentation improvements |
| `phase-2` | Planned for Phase 2 |
| `phase-3` | Planned for Phase 3 |
