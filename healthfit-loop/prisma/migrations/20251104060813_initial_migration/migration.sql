-- CreateEnum
CREATE TYPE "public"."HealthGoal" AS ENUM ('WEIGHT_LOSS', 'MUSCLE_GAIN', 'ENDURANCE', 'GENERAL_WELLNESS');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activeSurveyId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SurveyResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "sex" TEXT NOT NULL,
    "height" INTEGER NOT NULL,
    "weight" INTEGER NOT NULL,
    "streetAddress" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "zipCode" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'United States',
    "goal" "public"."HealthGoal" NOT NULL,
    "activityLevel" TEXT NOT NULL,
    "budgetTier" TEXT NOT NULL,
    "dietPrefs" TEXT[],
    "mealsOutPerWeek" INTEGER NOT NULL,
    "distancePreference" TEXT NOT NULL DEFAULT 'medium',
    "preferredCuisines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredFoods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "workoutPreferencesJson" JSONB,
    "biomarkerJson" JSONB,
    "source" TEXT NOT NULL DEFAULT 'web',
    "isGuest" BOOLEAN NOT NULL DEFAULT true,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MealPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "surveyId" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "weekNumber" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generationStarted" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generationEnded" TIMESTAMP(3),
    "regenerationCount" INTEGER NOT NULL DEFAULT 0,
    "userContext" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Meal" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "mealType" TEXT NOT NULL,
    "selectedOptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MealOption" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "optionNumber" INTEGER NOT NULL,
    "optionType" TEXT NOT NULL,
    "restaurantName" TEXT,
    "dishName" TEXT,
    "description" TEXT,
    "estimatedPrice" INTEGER,
    "orderingUrl" TEXT,
    "deliveryTime" TEXT,
    "recipeName" TEXT,
    "ingredients" TEXT[],
    "cookingTime" INTEGER,
    "instructions" TEXT,
    "difficulty" TEXT,
    "calories" INTEGER NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "carbs" DOUBLE PRECISION NOT NULL,
    "fat" DOUBLE PRECISION NOT NULL,
    "fiber" DOUBLE PRECISION,
    "sodium" INTEGER,
    "wasEaten" BOOLEAN NOT NULL DEFAULT false,
    "userRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MealFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "mealOptionId" TEXT NOT NULL,
    "feedbackType" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MealConsumptionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "mealId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "calories" INTEGER NOT NULL,
    "wasEaten" BOOLEAN NOT NULL DEFAULT false,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealConsumptionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserFoodPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredCuisines" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avoidedFoods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "portionSizeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "averageMealCost" INTEGER,
    "budgetFlexibility" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "cookingDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restaurantDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFoodPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RestaurantCache" (
    "id" TEXT NOT NULL,
    "zipcode" TEXT NOT NULL,
    "cuisineType" TEXT,
    "restaurants" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuCache" (
    "id" TEXT NOT NULL,
    "restaurantName" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "menuData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FoodImage" (
    "id" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "originalDishName" TEXT NOT NULL,
    "searchQuery" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageSource" TEXT NOT NULL DEFAULT 'pexels',
    "cuisineType" TEXT,
    "mealType" TEXT,
    "dishCategory" TEXT,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkoutImage" (
    "id" TEXT NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "originalExerciseName" TEXT NOT NULL,
    "searchQuery" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageSource" TEXT NOT NULL DEFAULT 'pexels',
    "muscleGroup" TEXT,
    "equipmentType" TEXT,
    "exerciseCategory" TEXT,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkoutPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "surveyId" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "weekNumber" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planData" JSONB NOT NULL,
    "preferredDuration" INTEGER NOT NULL DEFAULT 45,
    "availableDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "workoutTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "equipmentAccess" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fitnessExperience" TEXT NOT NULL DEFAULT 'intermediate',
    "injuryConsiderations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timePreferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkoutLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workoutPlanId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "totalCaloriesBurned" INTEGER,
    "averageHeartRate" INTEGER,
    "perceivedExertion" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkoutExerciseLog" (
    "id" TEXT NOT NULL,
    "workoutLogId" TEXT NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "setsCompleted" INTEGER NOT NULL DEFAULT 0,
    "repsCompleted" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "weightUsed" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
    "duration" INTEGER,
    "distance" DOUBLE PRECISION,
    "formRating" INTEGER,
    "difficultyRating" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkoutExerciseLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkoutProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workoutPlanId" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "workoutsCompleted" INTEGER NOT NULL DEFAULT 0,
    "workoutsPlanned" INTEGER NOT NULL DEFAULT 0,
    "totalDuration" INTEGER NOT NULL DEFAULT 0,
    "strengthGains" JSONB,
    "enduranceGains" JSONB,
    "flexibilityGains" JSONB,
    "weight" DOUBLE PRECISION,
    "bodyFatPercentage" DOUBLE PRECISION,
    "measurements" JSONB,
    "goalProgress" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkoutProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_activeSurveyId_key" ON "public"."User"("activeSurveyId");

-- CreateIndex
CREATE INDEX "SurveyResponse_userId_idx" ON "public"."SurveyResponse"("userId");

-- CreateIndex
CREATE INDEX "SurveyResponse_sessionId_idx" ON "public"."SurveyResponse"("sessionId");

-- CreateIndex
CREATE INDEX "SurveyResponse_email_idx" ON "public"."SurveyResponse"("email");

-- CreateIndex
CREATE INDEX "MealPlan_userId_idx" ON "public"."MealPlan"("userId");

-- CreateIndex
CREATE INDEX "MealPlan_surveyId_idx" ON "public"."MealPlan"("surveyId");

-- CreateIndex
CREATE INDEX "MealPlan_weekOf_idx" ON "public"."MealPlan"("weekOf");

-- CreateIndex
CREATE UNIQUE INDEX "Meal_mealPlanId_day_mealType_key" ON "public"."Meal"("mealPlanId", "day", "mealType");

-- CreateIndex
CREATE UNIQUE INDEX "MealOption_mealId_optionNumber_key" ON "public"."MealOption"("mealId", "optionNumber");

-- CreateIndex
CREATE INDEX "MealFeedback_userId_idx" ON "public"."MealFeedback"("userId");

-- CreateIndex
CREATE INDEX "MealConsumptionLog_userId_idx" ON "public"."MealConsumptionLog"("userId");

-- CreateIndex
CREATE INDEX "MealConsumptionLog_sessionId_idx" ON "public"."MealConsumptionLog"("sessionId");

-- CreateIndex
CREATE INDEX "MealConsumptionLog_mealId_idx" ON "public"."MealConsumptionLog"("mealId");

-- CreateIndex
CREATE INDEX "MealConsumptionLog_day_idx" ON "public"."MealConsumptionLog"("day");

-- CreateIndex
CREATE UNIQUE INDEX "UserFoodPreferences_userId_key" ON "public"."UserFoodPreferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantCache_zipcode_cuisineType_key" ON "public"."RestaurantCache"("zipcode", "cuisineType");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCache_restaurantName_location_key" ON "public"."MenuCache"("restaurantName", "location");

-- CreateIndex
CREATE UNIQUE INDEX "FoodImage_normalizedKey_key" ON "public"."FoodImage"("normalizedKey");

-- CreateIndex
CREATE INDEX "FoodImage_normalizedKey_idx" ON "public"."FoodImage"("normalizedKey");

-- CreateIndex
CREATE INDEX "FoodImage_cuisineType_mealType_idx" ON "public"."FoodImage"("cuisineType", "mealType");

-- CreateIndex
CREATE INDEX "FoodImage_lastUsed_idx" ON "public"."FoodImage"("lastUsed");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutImage_normalizedKey_key" ON "public"."WorkoutImage"("normalizedKey");

-- CreateIndex
CREATE INDEX "WorkoutImage_normalizedKey_idx" ON "public"."WorkoutImage"("normalizedKey");

-- CreateIndex
CREATE INDEX "WorkoutImage_muscleGroup_equipmentType_idx" ON "public"."WorkoutImage"("muscleGroup", "equipmentType");

-- CreateIndex
CREATE INDEX "WorkoutImage_lastUsed_idx" ON "public"."WorkoutImage"("lastUsed");

-- CreateIndex
CREATE INDEX "WorkoutPlan_userId_idx" ON "public"."WorkoutPlan"("userId");

-- CreateIndex
CREATE INDEX "WorkoutPlan_surveyId_idx" ON "public"."WorkoutPlan"("surveyId");

-- CreateIndex
CREATE INDEX "WorkoutPlan_weekOf_idx" ON "public"."WorkoutPlan"("weekOf");

-- CreateIndex
CREATE INDEX "WorkoutLog_userId_idx" ON "public"."WorkoutLog"("userId");

-- CreateIndex
CREATE INDEX "WorkoutLog_workoutPlanId_idx" ON "public"."WorkoutLog"("workoutPlanId");

-- CreateIndex
CREATE INDEX "WorkoutLog_date_idx" ON "public"."WorkoutLog"("date");

-- CreateIndex
CREATE INDEX "WorkoutExerciseLog_workoutLogId_idx" ON "public"."WorkoutExerciseLog"("workoutLogId");

-- CreateIndex
CREATE INDEX "WorkoutProgress_userId_idx" ON "public"."WorkoutProgress"("userId");

-- CreateIndex
CREATE INDEX "WorkoutProgress_workoutPlanId_idx" ON "public"."WorkoutProgress"("workoutPlanId");

-- CreateIndex
CREATE INDEX "WorkoutProgress_weekOf_idx" ON "public"."WorkoutProgress"("weekOf");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_activeSurveyId_fkey" FOREIGN KEY ("activeSurveyId") REFERENCES "public"."SurveyResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SurveyResponse" ADD CONSTRAINT "SurveyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MealPlan" ADD CONSTRAINT "MealPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Meal" ADD CONSTRAINT "Meal_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "public"."MealPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Meal" ADD CONSTRAINT "Meal_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "public"."MealOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MealOption" ADD CONSTRAINT "MealOption_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "public"."Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MealFeedback" ADD CONSTRAINT "MealFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MealFeedback" ADD CONSTRAINT "MealFeedback_mealOptionId_fkey" FOREIGN KEY ("mealOptionId") REFERENCES "public"."MealOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MealConsumptionLog" ADD CONSTRAINT "MealConsumptionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserFoodPreferences" ADD CONSTRAINT "UserFoodPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutPlan" ADD CONSTRAINT "WorkoutPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutLog" ADD CONSTRAINT "WorkoutLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutLog" ADD CONSTRAINT "WorkoutLog_workoutPlanId_fkey" FOREIGN KEY ("workoutPlanId") REFERENCES "public"."WorkoutPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutExerciseLog" ADD CONSTRAINT "WorkoutExerciseLog_workoutLogId_fkey" FOREIGN KEY ("workoutLogId") REFERENCES "public"."WorkoutLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutProgress" ADD CONSTRAINT "WorkoutProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkoutProgress" ADD CONSTRAINT "WorkoutProgress_workoutPlanId_fkey" FOREIGN KEY ("workoutPlanId") REFERENCES "public"."WorkoutPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
