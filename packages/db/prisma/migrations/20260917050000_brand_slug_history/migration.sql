-- 브랜드가 쓰던 옛 주소를 남긴다.
--
-- 입점 승인 때 브랜드를 자동으로 만드는데, 한글 이름이면 라틴 문자가 남지 않아
-- 주소가 `brand-a1b2c3d4` 가 된다. 그 자리의 주석은 "나중에 가맹점이 직접 고칠 수
-- 있다" 고 적어 두었지만 **고칠 화면이 없었다.** 고치는 길을 열면서 함께 둔다 —
-- 주소를 바꾸는 순간 그때까지 나간 링크가 죽고, 화면에는 멀쩡한 404 가 나와서
-- 아무도 사고인 줄 모른다(상품·기획전에서 같은 이유로 이미 두 번 겪었다).
CREATE TABLE "brand_slugs" (
    "slug" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_slugs_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "brand_slugs_brandId_idx" ON "brand_slugs"("brandId");

ALTER TABLE "brand_slugs" ADD CONSTRAINT "brand_slugs_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE CASCADE ON UPDATE CASCADE;
