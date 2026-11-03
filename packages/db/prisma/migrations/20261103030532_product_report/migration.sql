-- CreateEnum
CREATE TYPE "ProductReportReason" AS ENUM ('COUNTERFEIT', 'PROHIBITED', 'WRONG_INFO', 'UNSAFE', 'OTHER');

-- CreateTable
CREATE TABLE "product_reports" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "ProductReportReason" NOT NULL,
    "detail" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_reports_resolvedAt_createdAt_idx" ON "product_reports"("resolvedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_reports_productId_reporterId_key" ON "product_reports"("productId", "reporterId");

-- AddForeignKey
ALTER TABLE "product_reports" ADD CONSTRAINT "product_reports_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reports" ADD CONSTRAINT "product_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_reports" ADD CONSTRAINT "product_reports_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
