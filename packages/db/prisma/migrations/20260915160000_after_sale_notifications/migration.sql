-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'ORDER_CANCELLED';
ALTER TYPE "NotificationKind" ADD VALUE 'RETURN_APPROVED';
ALTER TYPE "NotificationKind" ADD VALUE 'RETURN_REJECTED';
ALTER TYPE "NotificationKind" ADD VALUE 'REFUND_COMPLETED';

