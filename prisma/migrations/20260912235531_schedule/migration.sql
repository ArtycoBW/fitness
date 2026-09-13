-- AlterTable
ALTER TABLE "HallClosure" ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TrainerAbsence" ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SessionSeries" (
    "id" UUID NOT NULL,
    "definition" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledSession" (
    "id" UUID NOT NULL,
    "seriesId" UUID,
    "occurrenceDate" TEXT,
    "workoutId" UUID NOT NULL,
    "trainerId" UUID NOT NULL,
    "hallId" UUID NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "policySnapshot" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "cancelledReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallOccupancy" (
    "id" UUID NOT NULL,
    "hallId" UUID NOT NULL,
    "sessionId" UUID,
    "closureId" UUID,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HallOccupancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerOccupancy" (
    "id" UUID NOT NULL,
    "trainerId" UUID NOT NULL,
    "sessionId" UUID,
    "absenceId" UUID,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TrainerOccupancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledSession_status_startAt_idx" ON "ScheduledSession"("status", "startAt");

-- CreateIndex
CREATE INDEX "ScheduledSession_trainerId_startAt_idx" ON "ScheduledSession"("trainerId", "startAt");

-- CreateIndex
CREATE INDEX "ScheduledSession_hallId_startAt_idx" ON "ScheduledSession"("hallId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledSession_seriesId_occurrenceDate_key" ON "ScheduledSession"("seriesId", "occurrenceDate");

-- CreateIndex
CREATE UNIQUE INDEX "HallOccupancy_sessionId_key" ON "HallOccupancy"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "HallOccupancy_closureId_key" ON "HallOccupancy"("closureId");

-- CreateIndex
CREATE INDEX "HallOccupancy_hallId_startAt_endAt_idx" ON "HallOccupancy"("hallId", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerOccupancy_sessionId_key" ON "TrainerOccupancy"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerOccupancy_absenceId_key" ON "TrainerOccupancy"("absenceId");

-- CreateIndex
CREATE INDEX "TrainerOccupancy_trainerId_startAt_endAt_idx" ON "TrainerOccupancy"("trainerId", "startAt", "endAt");

-- AddForeignKey
ALTER TABLE "ScheduledSession" ADD CONSTRAINT "ScheduledSession_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "SessionSeries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledSession" ADD CONSTRAINT "ScheduledSession_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "WorkoutType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledSession" ADD CONSTRAINT "ScheduledSession_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledSession" ADD CONSTRAINT "ScheduledSession_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallOccupancy" ADD CONSTRAINT "HallOccupancy_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallOccupancy" ADD CONSTRAINT "HallOccupancy_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScheduledSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallOccupancy" ADD CONSTRAINT "HallOccupancy_closureId_fkey" FOREIGN KEY ("closureId") REFERENCES "HallClosure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerOccupancy" ADD CONSTRAINT "TrainerOccupancy_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerOccupancy" ADD CONSTRAINT "TrainerOccupancy_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScheduledSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerOccupancy" ADD CONSTRAINT "TrainerOccupancy_absenceId_fkey" FOREIGN KEY ("absenceId") REFERENCES "TrainerAbsence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
