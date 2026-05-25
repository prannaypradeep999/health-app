-- AlterTable
ALTER TABLE "public"."WorkoutExerciseLog" ADD COLUMN     "weightUsedLbs" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "public"."ExerciseLibrary" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "muscleGroup" TEXT NOT NULL,
    "equipmentType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "defaultSets" INTEGER NOT NULL,
    "defaultReps" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "weightGuidance" TEXT NOT NULL,
    "beginnerMod" TEXT NOT NULL,
    "advancedMod" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserCustomWorkout" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "surveyId" TEXT,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "exercises" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCustomWorkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserWorkoutAddition" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "surveyId" TEXT,
    "workoutPlanId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "additionType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "exerciseLibraryId" TEXT,
    "customData" JSONB,
    "weightUsedLbs" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserWorkoutAddition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseLibrary_name_key" ON "public"."ExerciseLibrary"("name");

-- CreateIndex
CREATE INDEX "ExerciseLibrary_muscleGroup_idx" ON "public"."ExerciseLibrary"("muscleGroup");

-- CreateIndex
CREATE INDEX "ExerciseLibrary_equipmentType_idx" ON "public"."ExerciseLibrary"("equipmentType");

-- CreateIndex
CREATE INDEX "ExerciseLibrary_category_idx" ON "public"."ExerciseLibrary"("category");

-- CreateIndex
CREATE INDEX "ExerciseLibrary_difficulty_idx" ON "public"."ExerciseLibrary"("difficulty");

-- CreateIndex
CREATE INDEX "UserCustomWorkout_userId_idx" ON "public"."UserCustomWorkout"("userId");

-- CreateIndex
CREATE INDEX "UserCustomWorkout_surveyId_idx" ON "public"."UserCustomWorkout"("surveyId");

-- CreateIndex
CREATE INDEX "UserWorkoutAddition_userId_idx" ON "public"."UserWorkoutAddition"("userId");

-- CreateIndex
CREATE INDEX "UserWorkoutAddition_surveyId_idx" ON "public"."UserWorkoutAddition"("surveyId");

-- CreateIndex
CREATE INDEX "UserWorkoutAddition_workoutPlanId_idx" ON "public"."UserWorkoutAddition"("workoutPlanId");

-- CreateIndex
CREATE INDEX "UserWorkoutAddition_day_idx" ON "public"."UserWorkoutAddition"("day");

-- AddForeignKey
ALTER TABLE "public"."UserCustomWorkout" ADD CONSTRAINT "UserCustomWorkout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserWorkoutAddition" ADD CONSTRAINT "UserWorkoutAddition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserWorkoutAddition" ADD CONSTRAINT "UserWorkoutAddition_exerciseLibraryId_fkey" FOREIGN KEY ("exerciseLibraryId") REFERENCES "public"."ExerciseLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserWorkoutAddition" ADD CONSTRAINT "UserWorkoutAddition_workoutPlanId_fkey" FOREIGN KEY ("workoutPlanId") REFERENCES "public"."WorkoutPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
