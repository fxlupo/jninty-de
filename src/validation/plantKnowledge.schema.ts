import { z } from "zod";
import { plantTypeSchema } from "./plantInstance.schema.ts";

export const sunExposureSchema = z.enum([
  "full_sun",
  "partial_shade",
  "full_shade",
]);

export const waterNeedsSchema = z.enum(["low", "moderate", "high"]);

export const growthRateSchema = z.enum(["slow", "moderate", "fast"]);

export const plantKnowledgeSchema = z
  .object({
    species: z.string().min(1),
    variety: z.string().min(1).optional(),
    commonName: z.string().min(1),
    plantType: plantTypeSchema,
    isPerennial: z.boolean(),

    // Planting timing offsets (deterministic calendar math)
    indoorStartWeeksBeforeLastFrost: z.number().int().optional(),
    transplantWeeksAfterLastFrost: z.number().int().optional(),
    directSowWeeksBeforeLastFrost: z.number().int().optional(),
    directSowWeeksAfterLastFrost: z.number().int().optional(),
    daysToGermination: z.number().int().positive().optional(),
    daysToMaturity: z.number().int().positive().optional(),

    // Care info
    spacingInches: z.number().int().positive().optional(),
    sunNeeds: sunExposureSchema,
    waterNeeds: waterNeedsSchema,
    soilPreference: z.string().min(1).optional(),
    matureHeightInches: z.number().int().positive().optional(),
    matureSpreadInches: z.number().int().positive().optional(),
    growthRate: growthRateSchema.optional(),

    // Companion planting
    goodCompanions: z.array(z.string().min(1)).optional(),
    badCompanions: z.array(z.string().min(1)).optional(),

    // Common issues
    commonPests: z.array(z.string().min(1)).optional(),
    commonDiseases: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type PlantKnowledge = z.infer<typeof plantKnowledgeSchema>;
export type SunExposure = z.infer<typeof sunExposureSchema>;
export type WaterNeeds = z.infer<typeof waterNeedsSchema>;
export type GrowthRate = z.infer<typeof growthRateSchema>;
