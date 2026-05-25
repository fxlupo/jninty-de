import { get, post, patch, del } from "../../api/client.ts";

const BASE = "/api/calendar-events";

export interface CalendarEvent {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  userId: string;
  title: string;
  notes: string | null;
  date: string;
  type: "general" | "task" | "reminder";
  recurrence: "once" | "yearly" | "every_2y" | "every_3y" | "every_4y";
  relatedPlantId: string | null;
  relatedBedId: string | null;
}

export type CalendarEventType = CalendarEvent["type"];
export type CalendarEventRecurrence = CalendarEvent["recurrence"];

export type CalendarEventInput = {
  title: string;
  notes?: string | null;
  date: string;
  type?: CalendarEventType;
  recurrence?: CalendarEventRecurrence;
  relatedPlantId?: string | null;
  relatedBedId?: string | null;
};

export async function getAll(): Promise<CalendarEvent[]> {
  return get<CalendarEvent[]>(BASE);
}

export async function getRange(from: string, to: string): Promise<CalendarEvent[]> {
  return get<CalendarEvent[]>(`${BASE}?from=${from}&to=${to}`);
}

export async function getById(id: string): Promise<CalendarEvent | undefined> {
  try {
    return await get<CalendarEvent>(`${BASE}/${id}`);
  } catch {
    return undefined;
  }
}

export async function create(input: CalendarEventInput): Promise<CalendarEvent> {
  return post<CalendarEvent>(BASE, input);
}

export async function update(id: string, changes: Partial<CalendarEventInput>): Promise<CalendarEvent> {
  return patch<CalendarEvent>(`${BASE}/${id}`, changes);
}

export async function remove(id: string): Promise<void> {
  await del(`${BASE}/${id}`);
}
