-- AlterTable
ALTER TABLE "public"."SurveyResponse" ADD COLUMN     "activityLevel" TEXT,
ADD COLUMN     "age" INTEGER,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "height" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "mealsOutPerWeek" INTEGER,
ADD COLUMN     "sex" TEXT,
ADD COLUMN     "weight" INTEGER,
ADD COLUMN     "zipCode" TEXT;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT;
