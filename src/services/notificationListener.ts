import { formatISO, startOfDay } from "date-fns";
import { localDB } from "../db/pouchdb/client.ts";
import { stripPouchFields, type PouchDoc } from "../db/pouchdb/utils.ts";
import type { Task } from "../validation/task.schema.ts";
import { notifyTaskDueToday } from "./notifications.ts";

let changesListener: ReturnType<typeof localDB.changes> | null = null;

function todayDate(): string {
  return formatISO(startOfDay(new Date()), { representation: "date" });
}

function handleChange(
  change: PouchDB.Core.ChangesResponseChange<object>,
): void {
  if (change.deleted) return;

  const raw = change.doc;
  if (!raw) return;

  const docType = (raw as Record<string, unknown>)["docType"] as
    | string
    | undefined;
  if (docType !== "task") return;

  const entity = stripPouchFields(
    raw as PouchDoc<Record<string, unknown>>,
  ) as unknown as Task;

  if (entity.deletedAt != null) return;
  if (entity.isCompleted) return;
  if (entity.dueDate !== todayDate()) return;

  notifyTaskDueToday(entity.title);
}

export function startNotificationListening(): void {
  stopNotificationListening();

  changesListener = localDB
    .changes({
      live: true,
      since: "now",
      include_docs: true,
    })
    .on("change", handleChange);
}

export function stopNotificationListening(): void {
  if (changesListener) {
    changesListener.cancel();
    changesListener = null;
  }
}
