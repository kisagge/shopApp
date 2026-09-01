-- 부분 일치 검색용 트라이그램 색인을 쓰려면 확장이 먼저 있어야 한다.
-- Prisma 는 확장을 만들어 주지 않으므로 여기서 직접 만든다.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';

-- 기존 행 백필. 비워 두면 그 상품들이 검색에서 통째로 빠진다.
UPDATE "products" p
SET "searchText" = lower(p.name || ' ' || b.name)
FROM "brands" b
WHERE b.id = p."brandId";

-- CreateIndex
CREATE INDEX "products_soldCount_idx" ON "products"("soldCount" DESC);

-- CreateIndex
CREATE INDEX "products_publishedAt_idx" ON "products"("publishedAt" DESC);

-- CreateIndex
CREATE INDEX "products_searchText_idx" ON "products" USING GIN ("searchText" gin_trgm_ops);
