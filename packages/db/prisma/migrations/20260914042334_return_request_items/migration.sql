-- AlterTable
ALTER TABLE "return_requests" ADD COLUMN     "itemIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
