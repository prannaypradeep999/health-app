//  Zod schemas to validate the survey payload (client + server). Catches bad inputs early and gives typed safety across the app.
import { z } from 'zod';

export const SurveySchema = z.object({
  email: z.string().email(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  age: z.number().int().min(13).max(100).optional(),
  sex: z.string().optional(),
  height: z.string().optional(),
  weight: z.number().int().min(80).max(400).optional(),
  zipCode: z.string().optional(),
  goal: z.enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'ENDURANCE', 'GENERAL_WELLNESS']),
  activityLevel: z.string().optional(),
  budgetTier: z.string().min(1),
  dietPrefs: z.array(z.string()).default([]),
  mealsOutPerWeek: z.number().int().min(0).max(14).optional(),
  biomarkers: z
    .object({
      cholesterol: z.number().min(0).max(500).optional(),
      vitaminD: z.number().min(0).max(200).optional(),
      iron: z.number().min(0).max(300).optional(),
    })
    .partial()
    .optional(),
  source: z.string().optional(),
});

export type SurveyInput = z.infer<typeof SurveySchema>;