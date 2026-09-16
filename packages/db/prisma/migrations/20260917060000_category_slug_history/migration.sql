-- 카테고리가 쓰던 옛 주소를 남긴다.
--
-- 브랜드와 같은 이유다. 매대의 카테고리 조회에는 "창구가 없어서 거의 바뀌지
-- 않는다" 고 적혀 있었는데, 그건 캐시를 길게 잡아도 되는 이유이자 관리 화면이
-- 없다는 사실을 돌려 말한 것이기도 하다. 고치는 길을 열면서 함께 둔다.
CREATE TABLE "category_slugs" (
    "slug" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_slugs_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "category_slugs_categoryId_idx" ON "category_slugs"("categoryId");

ALTER TABLE "category_slugs" ADD CONSTRAINT "category_slugs_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
