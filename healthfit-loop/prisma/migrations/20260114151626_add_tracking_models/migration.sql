/*
  Warnings:

  - You are about to drop the column `budgetTier` on the `SurveyResponse` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[surveyId,weekNumber,day,mealType,optionType]` on the table `MealConsumptionLog` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[passwordResetToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[verificationToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `MealConsumptionLog` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."MealConsumptionLog" ADD COLUMN     "carbs" INTEGER,
ADD COLUMN     "fat" INTEGER,
ADD COLUMN     "mealName" TEXT,
ADD COLUMN     "mealPlanId" TEXT,
ADD COLUMN     "mealType" TEXT,
ADD COLUMN     "optionType" TEXT,
ADD COLUMN     "protein" INTEGER,
ADD COLUMN     "restaurantName" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "surveyId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "weekNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "public"."SurveyResponse" DROP COLUMN "budgetTier",
ADD COLUMN     "additionalGoalsNotes" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "fitnessLevel" TEXT,
ADD COLUMN     "goalChallenge" TEXT,
ADD COLUMN     "healthFocus" TEXT,
ADD COLUMN     "maintainFocus" TEXT,
ADD COLUMN     "preferredActivities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "primaryGoal" TEXT,
ADD COLUMN     "weeklyMealSchedule" JSONB,
ALTER COLUMN "mealsOutPerWeek" SET DEFAULT 7;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetExpiry" TIMESTAMP(3),
ADD COLUMN     "passwordResetToken" TEXT,
ADD COLUMN     "verificationToken" TEXT;

-- CreateTable
CREATE TABLE "public"."UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FoodProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "surveyId" TEXT NOT NULL,
    "profileContent" TEXT NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "userEdits" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkoutProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "surveyId" TEXT NOT NULL,
    "profileContent" TEXT NOT NULL,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "userEdits" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MealFeedbackLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "mealOptionId" TEXT NOT NULL,
    "feedbackType" TEXT NOT NULL,
    "rating" INTEGER,
    "dishName" TEXT NOT NULL,
    "restaurantName" TEXT,
    "isHomemade" BOOLEAN NOT NULL DEFAULT false,
    "mealType" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealFeedbackLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WeightLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "surveyId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'lbs',
    "notes" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FavoriteRestaurant" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "surveyId" TEXT NOT NULL,
    "restaurantName" TEXT NOT NULL,
    "cuisine" TEXT,
    "address" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteRestaurant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_sessionId_key" ON "public"."UserSession"("sessionId");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "public"."UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_sessionId_idx" ON "public"."UserSession"("sessionId");

-- CreateIndex
CREATE INDEX "FoodProfile_userId_idx" ON "public"."FoodProfile"("userId");

-- CreateIndex
CREATE INDEX "FoodProfile_surveyId_idx" ON "public"."FoodProfile"("surveyId");

-- CreateIndex
CREATE INDEX "WorkoutProfile_userId_idx" ON "public"."WorkoutProfile"("userId");

-- CreateIndex
CREATE INDEX "WorkoutProfile_surveyId_idx" ON "public"."WorkoutProfile"("surveyId");

-- CreateIndex
CREATE INDEX "MealFeedbackLog_userId_idx" ON "public"."MealFeedbackLog"("userId");

-- CreateIndex
CREATE INDEX "MealFeedbackLog_sessionId_idx" ON "public"."MealFeedbackLog"("sessionId");

-- CreateIndex
CREATE INDEX "MealFeedbackLog_dishName_idx" ON "public"."MealFeedbackLog"("dishName");

-- CreateIndex
CREATE INDEX "MealFeedbackLog_feedbackType_idx" ON "public"."MealFeedbackLog"("feedbackType");

-- CreateIndex
CREATE INDEX "MealFeedbackLog_weekOf_idx" ON "public"."MealFeedbackLog"("weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "MealFeedbackLog_mealOptionId_key" ON "public"."MealFeedbackLog"("mealOptionId");

-- CreateIndex
CREATE INDEX "WeightLog_surveyId_idx" ON "public"."WeightLog"("surveyId");

-- CreateIndex
CREATE INDEX "WeightLog_loggedAt_idx" ON "public"."WeightLog"("loggedAt");

-- CreateIndex
CREATE INDEX "FavoriteRestaurant_surveyId_idx" ON "public"."FavoriteRestaurant"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteRestaurant_surveyId_restaurantName_key" ON "public"."FavoriteRestaurant"("surveyId", "restaurantName");

-- CreateIndex
CREATE INDEX "MealConsumptionLog_surveyId_idx" ON "public"."MealConsumptionLog"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "MealConsumptionLog_surveyId_weekNumber_day_mealType_optionT_key" ON "public"."MealConsumptionLog"("surveyId", "weekNumber", "day", "mealType", "optionType");

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "public"."User"("passwordResetToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_verificationToken_key" ON "public"."User"("verificationToken");

-- AddForeignKey
ALTER TABLE "public"."UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FoodProfile" ADD CONSTRAINT "FoodProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutProfile" ADD CONSTRAINT "WorkoutProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MealFeedbackLog" ADD CONSTRAINT "MealFeedbackLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MealFeedbackLog" ADD CONSTRAINT "MealFeedbackLog_mealOptionId_fkey" FOREIGN KEY ("mealOptionId") REFERENCES "public"."MealOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
