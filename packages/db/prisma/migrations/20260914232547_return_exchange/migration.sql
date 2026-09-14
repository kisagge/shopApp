-- AlterTable
ALTER TABLE "return_requests" ADD COLUMN     "reshipCarrier" TEXT,
ADD COLUMN     "reshipTrackingNumber" TEXT,
ADD COLUMN     "reshippedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "return_exchange_lines" (
    "id" TEXT NOT NULL,
    "returnRequestId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "fromVariantId" TEXT NOT NULL,
    "fromOptionLabel" TEXT NOT NULL,
    "toVariantId" TEXT NOT NULL,
    "toOptionLabel" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "return_exchange_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "return_exchange_lines_returnRequestId_idx" ON "return_exchange_lines"("returnRequestId");

-- AddForeignKey
ALTER TABLE "return_exchange_lines" ADD CONSTRAINT "return_exchange_lines_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
