-- AlterTable
ALTER TABLE "public"."SurveyResponse" ADD COLUMN     "preferredNutrients" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "uploadedFiles" TEXT[] DEFAULT ARRAY[]::TEXT[];
