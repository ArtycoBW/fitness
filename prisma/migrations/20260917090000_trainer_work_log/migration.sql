CREATE TABLE "TrainerWorkLog" (
  "sessionId" UUID NOT NULL PRIMARY KEY,
  "minutes" INTEGER NOT NULL CHECK ("minutes" BETWEEN 0 AND 1440),
  "note" TEXT NOT NULL DEFAULT '',
  "recordedBy" UUID NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "TrainerWorkLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ScheduledSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
