-- AlterTable
ALTER TABLE "return_requests" ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedBy" TEXT;
