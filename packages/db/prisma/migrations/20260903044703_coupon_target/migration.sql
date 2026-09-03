-- CreateTable
CREATE TABLE "coupon_targets" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "coupon_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coupon_targets_couponId_idx" ON "coupon_targets"("couponId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_targets_couponId_targetType_targetId_key" ON "coupon_targets"("couponId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "coupon_targets" ADD CONSTRAINT "coupon_targets_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
