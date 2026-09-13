-- CreateTable
CREATE TABLE "Exercise" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instructions" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "imageUrl" TEXT,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingProgram" (
    "id" UUID NOT NULL,
    "authorTrainerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramVersion" (
    "id" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "weeks" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramDay" (
    "id" UUID NOT NULL,
    "programVersionId" UUID NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "ProgramDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramExercise" (
    "id" UUID NOT NULL,
    "dayId" UUID NOT NULL,
    "exerciseId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "exerciseSnapshot" JSONB NOT NULL,
    "sets" INTEGER NOT NULL,
    "reps" INTEGER,
    "durationSeconds" INTEGER,
    "weightKg" DECIMAL(6,2),
    "restSeconds" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,

    CONSTRAINT "ProgramExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramAssignment" (
    "id" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "programVersionId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "trainerId" UUID NOT NULL,
    "startsOn" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "replacedById" UUID,

    CONSTRAINT "ProgramAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramDayLog" (
    "id" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "dayId" UUID NOT NULL,
    "performedOn" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "comment" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramDayLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciseSetLog" (
    "id" UUID NOT NULL,
    "dayLogId" UUID NOT NULL,
    "programExerciseId" UUID NOT NULL,
    "setIndex" INTEGER NOT NULL,
    "actualReps" INTEGER,
    "actualSeconds" INTEGER,
    "actualWeightKg" DECIMAL(6,2),

    CONSTRAINT "ExerciseSetLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramLogRevision" (
    "id" UUID NOT NULL,
    "dayLogId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramLogRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramComment" (
    "id" UUID NOT NULL,
    "assignmentId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'SHARED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exercise_name_idx" ON "Exercise"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramVersion_programId_number_key" ON "ProgramVersion"("programId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramDay_programVersionId_weekNumber_dayIndex_key" ON "ProgramDay"("programVersionId", "weekNumber", "dayIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramExercise_dayId_position_key" ON "ProgramExercise"("dayId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramAssignment_replacedById_key" ON "ProgramAssignment"("replacedById");

-- CreateIndex
CREATE INDEX "ProgramAssignment_clientId_status_idx" ON "ProgramAssignment"("clientId", "status");

-- CreateIndex
CREATE INDEX "ProgramAssignment_trainerId_status_idx" ON "ProgramAssignment"("trainerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramDayLog_assignmentId_dayId_key" ON "ProgramDayLog"("assignmentId", "dayId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseSetLog_dayLogId_programExerciseId_setIndex_key" ON "ExerciseSetLog"("dayLogId", "programExerciseId", "setIndex");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramLogRevision_dayLogId_version_key" ON "ProgramLogRevision"("dayLogId", "version");

-- CreateIndex
CREATE INDEX "ProgramComment_assignmentId_createdAt_idx" ON "ProgramComment"("assignmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "TrainingProgram" ADD CONSTRAINT "TrainingProgram_authorTrainerId_fkey" FOREIGN KEY ("authorTrainerId") REFERENCES "TrainerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramVersion" ADD CONSTRAINT "ProgramVersion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "TrainingProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDay" ADD CONSTRAINT "ProgramDay_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExercise" ADD CONSTRAINT "ProgramExercise_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ProgramDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramExercise" ADD CONSTRAINT "ProgramExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "TrainingProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_programVersionId_fkey" FOREIGN KEY ("programVersionId") REFERENCES "ProgramVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramAssignment" ADD CONSTRAINT "ProgramAssignment_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "ProgramAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDayLog" ADD CONSTRAINT "ProgramDayLog_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProgramAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramDayLog" ADD CONSTRAINT "ProgramDayLog_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "ProgramDay"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSetLog" ADD CONSTRAINT "ExerciseSetLog_dayLogId_fkey" FOREIGN KEY ("dayLogId") REFERENCES "ProgramDayLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseSetLog" ADD CONSTRAINT "ExerciseSetLog_programExerciseId_fkey" FOREIGN KEY ("programExerciseId") REFERENCES "ProgramExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramLogRevision" ADD CONSTRAINT "ProgramLogRevision_dayLogId_fkey" FOREIGN KEY ("dayLogId") REFERENCES "ProgramDayLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramComment" ADD CONSTRAINT "ProgramComment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ProgramAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
