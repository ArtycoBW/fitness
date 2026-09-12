-- AlterTable
ALTER TABLE "ClientProfile" ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "StaffInvite" ADD COLUMN     "clientId" UUID;

-- AlterTable
ALTER TABLE "TrainerProfile" ADD COLUMN     "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "workingHours" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "ClientNote" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerClient" (
    "trainerId" UUID NOT NULL,
    "clientId" UUID NOT NULL,

    CONSTRAINT "TrainerClient_pkey" PRIMARY KEY ("trainerId","clientId")
);

-- CreateTable
CREATE TABLE "Hall" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER NOT NULL,
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Hall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HallClosure" (
    "id" UUID NOT NULL,
    "hallId" UUID NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "HallClosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerAbsence" (
    "id" UUID NOT NULL,
    "trainerId" UUID NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "TrainerAbsence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkoutType" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'ALL',
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "format" TEXT NOT NULL DEFAULT 'GROUP',
    "capacity" INTEGER NOT NULL DEFAULT 12,
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "WorkoutType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hall_slug_key" ON "Hall"("slug");

-- CreateIndex
CREATE INDEX "HallClosure_hallId_startAt_endAt_idx" ON "HallClosure"("hallId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "TrainerAbsence_trainerId_startAt_endAt_idx" ON "TrainerAbsence"("trainerId", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkoutType_slug_key" ON "WorkoutType"("slug");

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerClient" ADD CONSTRAINT "TrainerClient_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerClient" ADD CONSTRAINT "TrainerClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HallClosure" ADD CONSTRAINT "HallClosure_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAbsence" ADD CONSTRAINT "TrainerAbsence_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "TrainerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
