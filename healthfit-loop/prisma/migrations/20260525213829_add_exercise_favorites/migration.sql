-- CreateTable
CREATE TABLE "public"."UserExerciseFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "surveyId" TEXT,
    "exerciseLibraryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserExerciseFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserExerciseFavorite_userId_idx" ON "public"."UserExerciseFavorite"("userId");

-- CreateIndex
CREATE INDEX "UserExerciseFavorite_surveyId_idx" ON "public"."UserExerciseFavorite"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserExerciseFavorite_userId_exerciseLibraryId_key" ON "public"."UserExerciseFavorite"("userId", "exerciseLibraryId");

-- CreateIndex
CREATE UNIQUE INDEX "UserExerciseFavorite_surveyId_exerciseLibraryId_key" ON "public"."UserExerciseFavorite"("surveyId", "exerciseLibraryId");

-- AddForeignKey
ALTER TABLE "public"."UserExerciseFavorite" ADD CONSTRAINT "UserExerciseFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserExerciseFavorite" ADD CONSTRAINT "UserExerciseFavorite_exerciseLibraryId_fkey" FOREIGN KEY ("exerciseLibraryId") REFERENCES "public"."ExerciseLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
