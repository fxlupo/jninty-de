import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.ts";
import { userPlantKnowledge } from "../db/schema.ts";
import { requireAuth } from "../middleware/requireAuth.ts";
import type { AppVariables } from "../types.ts";

const router = new Hono<{ Variables: AppVariables }>();

// ─── HTML → plain text helper ───────────────────────────────────────────────

function htmlToText(html: string): string {
  return html
    // Remove script, style, nav, header, footer blocks entirely
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    // Block elements → newline
    .replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Strip remaining tags
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Collapse whitespace
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    // Limit to 12000 chars to stay within API token budget
    // (NaturaDB pages have multiple long sections; 6000 was too short for Verwendung/Schädlinge)
    .slice(0, 12000);
}

// ─── Claude API call ────────────────────────────────────────────────────────

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClaudeResponse {
  content: Array<{ type: string; text: string }>;
}

async function callClaude(messages: ClaudeMessage[]): Promise<string> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY ist nicht konfiguriert.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API Fehler ${res.status}: ${err}`);
  }

  const data = (await res.json()) as ClaudeResponse;
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  return text;
}

// ─── POST /api/knowledge/import-url ────────────────────────────────────────
// Must be registered BEFORE /:id routes to avoid path collision.

router.post("/import-url", requireAuth, async (c) => {
  const body = await c.req.json<{ url?: string }>();
  const url = body.url?.trim();

  if (!url) return c.json({ error: "URL fehlt." }, 400);

  // Basic URL validation
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return c.json({ error: "Ungültige URL." }, 400);
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return c.json({ error: "Nur HTTP/HTTPS-URLs erlaubt." }, 400);
  }

  // Fetch page HTML
  let html: string;
  try {
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; JnintyBot/1.0; +https://github.com/fxlupo/jninty-de)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "de-DE,de;q=0.9",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!pageRes.ok) {
      return c.json({ error: `Seite nicht erreichbar (${pageRes.status}).` }, 400);
    }
    html = await pageRes.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Seite konnte nicht geladen werden: ${msg}` }, 400);
  }

  const pageText = htmlToText(html);

  // Build prompt for Claude
  const prompt = `Extrahiere aus dem folgenden Webseitentext Pflanzendaten und gib sie als reines JSON-Objekt zurück.

Verwende ausschließlich diese Felder (alle optional außer commonName, species, plantType, sunNeeds, waterNeeds, isPerennial):

{
  "commonName": "Gemeiner Name auf Deutsch",
  "species": "Botanischer Name Gattung Art",
  "variety": "Sortenname falls vorhanden",
  "plantType": "vegetable|herb|flower|ornamental|fruit_tree|berry|shrub|hedge|other",
  "isPerennial": true,
  "family": "Pflanzenfamilie",
  "cropGroup": "kleingeschriebener-kurzname",
  "bloomMonths": [5,6,7],
  "flowerColors": ["gelb","weiß"],
  "heightCm": 150,
  "spreadCm": 80,
  "spacingCm": 50,
  "sunNeeds": "full_sun|partial_shade|full_shade",
  "waterNeeds": "low|moderate|high",
  "soilPreference": "humos, durchlässig",
  "winterHardinessC": -20,
  "usageTypes": ["Beet","Kübel","Hecke"],
  "growthHabit": "aufrecht",
  "nativeRegion": "Ostasien",
  "plantingMonths": [3,4,9,10],
  "pruningMonths": [2,3],
  "goodCompanions": ["Rosen","Lavendel"],
  "badCompanions": [],
  "commonPests": ["Blattläuse","Spinnmilben"],
  "commonDiseases": ["Echter Mehltau"],
  "careNotes": "Kurze allgemeine Pflegebeschreibung (1-3 Sätze)",
  "standortInfo": "VOLLSTÄNDIGER TEXT aus dem Abschnitt 'Standort' — alles was dort steht, wörtlich und vollständig",
  "schnittInfo": "VOLLSTÄNDIGER TEXT aus dem Abschnitt 'Schnitt' oder 'Rückschnitt' — wann, wie stark, welche Methode, vollständig",
  "vermehrung": ["Stecklinge","Aussaat","Teilung"],
  "vermehrungInfo": "VOLLSTÄNDIGER TEXT aus dem Abschnitt 'Vermehrung' — alle Methoden mit Details, vollständig",
  "verwendungInfo": "VOLLSTÄNDIGER TEXT aus dem Abschnitt 'Verwendung' oder 'Verwendungsmöglichkeiten' — wo und wie die Pflanze eingesetzt wird, vollständig",
  "schaedlingeInfo": "VOLLSTÄNDIGER TEXT aus dem Abschnitt 'Schädlinge', 'Krankheiten' oder 'Schädlinge & Krankheiten' — alle genannten Probleme mit Beschreibung und Bekämpfungshinweisen, vollständig"
}

Regeln:
- Monate immer als Zahlen 1-12 (1=Januar, 12=Dezember)
- winterHardinessC: niedrigste Temperatur in °C (z.B. -20 für sehr frosthart, 0 für nicht frosthart)
- cropGroup: aus commonName ableiten, Kleinbuchstaben mit Bindestrichen, z.B. "kolkwitzie"
- plantType: "shrub" für Sträucher, "ornamental" für Zierpflanzen, "flower" für Blumen, "fruit_tree" für Obstbäume
- Fehlende Felder WEGLASSEN (nicht null, nicht leere Arrays)
- standortInfo / schnittInfo / vermehrungInfo / verwendungInfo / schaedlingeInfo: Den VOLLSTÄNDIGEN Text des jeweiligen Abschnitts übernehmen, NICHTS kürzen, kein Satz weglassen. Wenn ein Abschnitt nicht vorhanden ist, das Feld weglassen.
- vermehrung: Kurzform als Array für die Tags, z.B. ["Stecklinge", "Aussaat"]
- commonPests / commonDiseases: Kurzform als Array für die Tags (aus schaedlingeInfo ableiten)
- usageTypes: Kurzform als Array, z.B. ["Beet", "Kübel"] (aus verwendungInfo ableiten)
- NUR das JSON-Objekt zurückgeben, kein erklärender Text, keine Markdown-Codeblöcke

Webseitentext:
${pageText}`;

  let rawJson: string;
  try {
    rawJson = await callClaude([{ role: "user", content: prompt }]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `KI-Extraktion fehlgeschlagen: ${msg}` }, 500);
  }

  // Extract JSON from response (Claude sometimes wraps in markdown)
  const jsonMatch =
    rawJson.match(/```(?:json)?\s*([\s\S]*?)```/) ??
    rawJson.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1]! : rawJson;

  let extracted: Record<string, unknown>;
  try {
    extracted = JSON.parse(jsonStr.trim()) as Record<string, unknown>;
  } catch {
    return c.json(
      { error: "Konnte kein gültiges JSON aus der KI-Antwort extrahieren." },
      500,
    );
  }

  // Attach source URL
  extracted["sourceUrl"] = url;
  // Ensure vermehrung is always an array if present
  if (typeof extracted["vermehrung"] === "string") {
    extracted["vermehrung"] = (extracted["vermehrung"] as string)
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  return c.json(extracted);
});

function now(): string {
  return new Date().toISOString();
}

type KnowledgeBody = Omit<
  typeof userPlantKnowledge.$inferInsert,
  "id" | "userId" | "version" | "createdAt" | "updatedAt" | "deletedAt"
>;

type KnowledgePatch = Partial<KnowledgeBody>;

/** GET /api/knowledge */
router.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const rows = await db
    .select()
    .from(userPlantKnowledge)
    .where(and(eq(userPlantKnowledge.userId, userId), isNull(userPlantKnowledge.deletedAt)));
  return c.json(rows);
});

/** GET /api/knowledge/:id */
router.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const rows = await db
    .select()
    .from(userPlantKnowledge)
    .where(and(eq(userPlantKnowledge.id, id), eq(userPlantKnowledge.userId, userId)));
  const row = rows[0];
  if (!row || row.deletedAt != null) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** POST /api/knowledge */
router.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<KnowledgeBody>();
  const result = await db
    .insert(userPlantKnowledge)
    .values({ ...body, id: crypto.randomUUID(), userId, version: 1, createdAt: now(), updatedAt: now() })
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Insert failed" }, 500);
  return c.json(row, 201);
});

/** PATCH /api/knowledge/:id
 * Query param ?replaceAll=1 clears optional data fields before merging (handled client-side,
 * server just stores the supplied values).
 */
router.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const body = await c.req.json<KnowledgePatch>();
  const result = await db
    .update(userPlantKnowledge)
    .set({ ...body, version: sql`${userPlantKnowledge.version} + 1`, updatedAt: now() })
    .where(and(eq(userPlantKnowledge.id, id), eq(userPlantKnowledge.userId, userId), isNull(userPlantKnowledge.deletedAt)))
    .returning();
  const row = result[0];
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

/** DELETE /api/knowledge/:id — soft delete */
router.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id") ?? "";
  const result = await db
    .update(userPlantKnowledge)
    .set({ deletedAt: now(), updatedAt: now(), version: sql`${userPlantKnowledge.version} + 1` })
    .where(and(eq(userPlantKnowledge.id, id), eq(userPlantKnowledge.userId, userId), isNull(userPlantKnowledge.deletedAt)))
    .returning();
  if (!result[0]) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export default router;
