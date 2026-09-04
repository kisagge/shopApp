-- AlterEnum
ALTER TYPE "ProductStatus" ADD VALUE 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "publishRejection" TEXT,
ADD COLUMN     "reviewRequestedAt" TIMESTAMP(3);
