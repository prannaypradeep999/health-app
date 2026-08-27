-- DropForeignKey
ALTER TABLE "public"."MealFeedbackLog" DROP CONSTRAINT "MealFeedbackLog_mealOptionId_fkey";

-- DropIndex
DROP INDEX "public"."MealFeedbackLog_mealOptionId_key";

-- AlterTable
ALTER TABLE "public"."MealFeedbackLog" DROP COLUMN "mealOptionId",
ADD COLUMN     "mealKey" TEXT NOT NULL,
ADD COLUMN     "ownerKey" TEXT NOT NULL DEFAULT 'anon';

-- CreateIndex
CREATE UNIQUE INDEX "MealFeedbackLog_ownerKey_mealKey_key" ON "public"."MealFeedbackLog"("ownerKey", "mealKey");

