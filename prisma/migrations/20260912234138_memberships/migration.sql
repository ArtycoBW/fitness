-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPlanVersion" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "visitLimit" INTEGER,
    "freezeQuotaDays" INTEGER NOT NULL DEFAULT 0,
    "activationWindowDays" INTEGER NOT NULL DEFAULT 30,
    "weekdays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "startMinute" INTEGER NOT NULL DEFAULT 0,
    "endMinute" INTEGER NOT NULL DEFAULT 1440,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipPlanVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "planVersionId" UUID NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "activationDate" TIMESTAMP(3) NOT NULL,
    "productSnapshot" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "planVersionId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "termsSnapshot" JSONB NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "consumed" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipLedger" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "bookingId" UUID,
    "eventKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "availableDelta" INTEGER NOT NULL,
    "reservedDelta" INTEGER NOT NULL,
    "consumedDelta" INTEGER NOT NULL,
    "reason" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipFreeze" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipFreeze_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "route" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PlanHalls" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_PlanHalls_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_PlanWorkouts" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_PlanWorkouts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_PlanTrainers" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL,

    CONSTRAINT "_PlanTrainers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_slug_key" ON "MembershipPlan"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlanVersion_planId_number_key" ON "MembershipPlanVersion"("planId", "number");

-- CreateIndex
CREATE INDEX "Order_clientId_createdAt_idx" ON "Order"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_orderId_key" ON "Membership"("orderId");

-- CreateIndex
CREATE INDEX "Membership_clientId_endAt_idx" ON "Membership"("clientId", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipLedger_eventKey_key" ON "MembershipLedger"("eventKey");

-- CreateIndex
CREATE INDEX "MembershipLedger_membershipId_createdAt_idx" ON "MembershipLedger"("membershipId", "createdAt");

-- CreateIndex
CREATE INDEX "MembershipFreeze_membershipId_startAt_endAt_idx" ON "MembershipFreeze"("membershipId", "startAt", "endAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_actorId_route_key_key" ON "IdempotencyRecord"("actorId", "route", "key");

-- CreateIndex
CREATE INDEX "_PlanHalls_B_index" ON "_PlanHalls"("B");

-- CreateIndex
CREATE INDEX "_PlanWorkouts_B_index" ON "_PlanWorkouts"("B");

-- CreateIndex
CREATE INDEX "_PlanTrainers_B_index" ON "_PlanTrainers"("B");

-- AddForeignKey
ALTER TABLE "MembershipPlanVersion" ADD CONSTRAINT "MembershipPlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "MembershipPlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "ClientProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_planVersionId_fkey" FOREIGN KEY ("planVersionId") REFERENCES "MembershipPlanVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipLedger" ADD CONSTRAINT "MembershipLedger_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipFreeze" ADD CONSTRAINT "MembershipFreeze_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanHalls" ADD CONSTRAINT "_PlanHalls_A_fkey" FOREIGN KEY ("A") REFERENCES "Hall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanHalls" ADD CONSTRAINT "_PlanHalls_B_fkey" FOREIGN KEY ("B") REFERENCES "MembershipPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanWorkouts" ADD CONSTRAINT "_PlanWorkouts_A_fkey" FOREIGN KEY ("A") REFERENCES "MembershipPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanWorkouts" ADD CONSTRAINT "_PlanWorkouts_B_fkey" FOREIGN KEY ("B") REFERENCES "WorkoutType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanTrainers" ADD CONSTRAINT "_PlanTrainers_A_fkey" FOREIGN KEY ("A") REFERENCES "MembershipPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PlanTrainers" ADD CONSTRAINT "_PlanTrainers_B_fkey" FOREIGN KEY ("B") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
