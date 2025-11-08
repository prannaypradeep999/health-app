-- AlterTable
ALTER TABLE "public"."SurveyResponse" ADD COLUMN     "fitnessTimeline" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "monthlyFitnessBudget" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "monthlyFoodBudget" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "sportsInterests" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "public"."Recipe" (
    "id" TEXT NOT NULL,
    "dishName" TEXT NOT NULL,
    "originalDishName" TEXT NOT NULL,
    "mealType" TEXT,
    "description" TEXT,
    "recipeData" JSONB NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_dishName_key" ON "public"."Recipe"("dishName");

-- CreateIndex
CREATE INDEX "Recipe_dishName_idx" ON "public"."Recipe"("dishName");

-- CreateIndex
CREATE INDEX "Recipe_mealType_idx" ON "public"."Recipe"("mealType");

-- CreateIndex
CREATE INDEX "Recipe_lastUsed_idx" ON "public"."Recipe"("lastUsed");
