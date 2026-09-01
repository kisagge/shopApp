-- AlterTable
ALTER TABLE "products" ADD COLUMN     "sellingPrice" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "products_sellingPrice_idx" ON "products"("sellingPrice");
