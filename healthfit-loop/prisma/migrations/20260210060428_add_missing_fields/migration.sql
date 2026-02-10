-- AlterTable
ALTER TABLE "public"."SurveyResponse" ADD COLUMN     "customFoodInput" TEXT,
ADD COLUMN     "dashboardEmailSent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "eatingOutOccasions" TEXT,
ADD COLUMN     "foodAllergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "healthGoalPriority" TEXT,
ADD COLUMN     "motivationLevel" TEXT,
ADD COLUMN     "strictExclusions" JSONB;
