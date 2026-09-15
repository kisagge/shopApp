-- AlterTable
ALTER TABLE "point_transactions" ADD COLUMN     "adjustKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "point_transactions_adjustKey_key" ON "point_transactions"("adjustKey");

