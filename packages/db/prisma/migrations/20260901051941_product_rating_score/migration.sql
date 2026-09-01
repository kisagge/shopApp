-- AlterTable
ALTER TABLE "products" ADD COLUMN     "ratingScore" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "products_ratingScore_idx" ON "products"("ratingScore" DESC);

-- 기존 행 백필. 시드로 들어간 평점이 정렬에서 빠지면 안 된다.
UPDATE "products"
SET "ratingScore" = round(("ratingSum"::numeric / "reviewCount") * 100)
WHERE "reviewCount" > 0;
