-- CreateEnum
CREATE TYPE "ProductArchiver" AS ENUM ('MERCHANT', 'STAFF');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "archivedBy" "ProductArchiver";

