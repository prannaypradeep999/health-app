//  Zod schemas to validate the survey payload (client + server). Catches bad inputs early and gives typed safety across the app.
import { z } from 'zod';

export const SurveySchema = z.object({
  email: z.string().email(),
  goal: z.enum(['WEIGHT_LOSS', 'MUSCLE_GAIN', 'ENDURANCE', 'GENERAL_WELLNESS']),
  budgetTier: z.string().min(1),
  dietPrefs: z.array(z.string()).default([]),
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
