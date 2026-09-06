-- 리뷰 사진을 배열 둘에서 표로 옮긴다.
--
-- Prisma 가 만들어 준 것은 **칸부터 지우고** 표를 만드는 순서였다. 그대로
-- 두면 지금까지 올라온 사진 기록이 통째로 사라진다. 만들고 · 옮기고 · 지운다.

-- 1. 표를 먼저 만든다
CREATE TABLE "review_images" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "blurDataUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "review_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "review_images_reviewId_idx" ON "review_images"("reviewId");

ALTER TABLE "review_images" ADD CONSTRAINT "review_images_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. 배열을 줄로 편다.
--
-- 두 배열을 자리 번호로 맞춘다. 그 번호가 곧 순서라, 화면에 보이던 차례가
-- 그대로 남는다. 한쪽이 짧으면 그 자리는 옮기지 않는다 — 짝이 없는 주소나
-- 키를 지어내는 것보다 빠뜨리는 편이 낫다(어긋난 상태를 옮겨 심지 않는다).
INSERT INTO "review_images" ("id", "reviewId", "url", "storageKey", "sortOrder")
SELECT
  r."id" || '-img-' || u."ord",
  r."id",
  u."url",
  k."key",
  (u."ord" - 1)::int
FROM "reviews" r
CROSS JOIN LATERAL unnest(r."imageUrls") WITH ORDINALITY AS u("url", "ord")
CROSS JOIN LATERAL unnest(r."imageKeys") WITH ORDINALITY AS k("key", "ord")
WHERE u."ord" = k."ord";

-- 3. 옮긴 뒤에 지운다
ALTER TABLE "reviews" DROP COLUMN "imageKeys",
DROP COLUMN "imageUrls";
