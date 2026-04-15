import type { ScheduleTaskType } from "../../validation/scheduleTask.schema.ts";

export const TASK_TYPE_COLORS: Record<ScheduleTaskType, string> = {
  seed_start: "#5da02e",   // sage green (green-500)
  bed_prep: "#b87a2a",     // warm tan (brown-500)
  transplant: "#d4623a",   // terracotta (terracotta-500)
  cultivate: "#7d4f16",    // warm olive (brown-700)
  harvest: "#7a3b8f",      // deep plum
};

export const TASK_TYPE_LABELS: Record<ScheduleTaskType, string> = {
  seed_start: "Aussaat",
  bed_prep: "Beetvorb.",
  transplant: "Pflanzen",
  cultivate: "Pflege",
  harvest: "Ernte",
};
