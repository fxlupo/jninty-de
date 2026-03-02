import { localDB } from "../db/pouchdb/client.ts";

interface ConflictDoc {
  _id: string;
  _rev: string;
  _conflicts?: string[];
}

export async function getConflicts(): Promise<ConflictDoc[]> {
  const result = await localDB.allDocs({
    conflicts: true,
    include_docs: true,
  });

  const conflicts: ConflictDoc[] = [];
  for (const row of result.rows) {
    const doc = row.doc as ConflictDoc | undefined;
    if (doc?._conflicts && doc._conflicts.length > 0) {
      conflicts.push(doc);
    }
  }
  return conflicts;
}

export async function resolveConflict(
  docId: string,
  winningRev: string,
): Promise<void> {
  const doc = await localDB.get(docId, { conflicts: true });
  const allConflicts = (doc as ConflictDoc)._conflicts ?? [];

  // Delete all revisions that are not the winner
  for (const rev of allConflicts) {
    if (rev !== winningRev) {
      await localDB.remove(docId, rev);
    }
  }

  // If the current rev is not the winner, we need to swap them
  if (doc._rev !== winningRev) {
    const winner = await localDB.get(docId, { rev: winningRev });
    // Remove the current (losing) rev
    await localDB.remove(docId, doc._rev);
    // Put the winner back
    await localDB.put(winner);
  }
}

export async function autoResolveByLastWrite(): Promise<number> {
  const conflictDocs = await getConflicts();
  let resolved = 0;

  for (const doc of conflictDocs) {
    try {
      const allRevs = [doc._rev, ...(doc._conflicts ?? [])];
      let latestRev = doc._rev;
      let latestTime = getUpdatedAt(doc);

      for (const rev of doc._conflicts ?? []) {
        const revDoc = await localDB.get(doc._id, { rev });
        const revTime = getUpdatedAt(revDoc);
        if (revTime > latestTime) {
          latestTime = revTime;
          latestRev = rev;
        }
      }

      // Delete all losing revisions
      for (const rev of allRevs) {
        if (rev !== latestRev) {
          await localDB.remove(doc._id, rev);
        }
      }

      resolved++;
      console.log(
        `[sync] Auto-resolved conflict on ${doc._id}: kept rev ${latestRev}`,
      );
    } catch (err) {
      console.warn(`[sync] Failed to resolve conflict on ${doc._id}:`, err);
    }
  }

  return resolved;
}

function getUpdatedAt(doc: unknown): string {
  const d = doc as Record<string, unknown>;
  return (typeof d["updatedAt"] === "string" ? d["updatedAt"] : "") as string;
}
