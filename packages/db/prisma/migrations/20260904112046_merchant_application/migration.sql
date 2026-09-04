-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "applicantId" TEXT,
ADD COLUMN     "brandName" TEXT;

-- AddForeignKey
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
