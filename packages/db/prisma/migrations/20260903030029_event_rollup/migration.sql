-- CreateTable
CREATE TABLE "event_daily" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "events" INTEGER NOT NULL,
    "sessions" INTEGER NOT NULL,
    "users" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "event_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funnel_daily" (
    "id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "step" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,

    CONSTRAINT "funnel_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_rollups" (
    "day" DATE NOT NULL,
    "rawEvents" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_rollups_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "event_daily_day_idx" ON "event_daily"("day");

-- CreateIndex
CREATE UNIQUE INDEX "event_daily_day_name_key" ON "event_daily"("day", "name");

-- CreateIndex
CREATE INDEX "funnel_daily_day_idx" ON "funnel_daily"("day");

-- CreateIndex
CREATE UNIQUE INDEX "funnel_daily_day_step_key" ON "funnel_daily"("day", "step");
