-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'COUPON_EXPIRING';
ALTER TYPE "NotificationKind" ADD VALUE 'POINTS_EXPIRING';

-- AlterTable
ALTER TABLE "point_transactions" ADD COLUMN     "expiryNoticeAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_coupons" ADD COLUMN     "expiryNoticeAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "user_coupons_expiresAt_usedAt_idx" ON "user_coupons"("expiresAt", "usedAt");

