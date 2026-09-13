-- CreateTable
CREATE TABLE "shipping_policy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "baseFee" INTEGER NOT NULL,
    "freeThreshold" INTEGER,
    "remoteSurcharge" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "shipping_policy_pkey" PRIMARY KEY ("id")
);
