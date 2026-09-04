/*
  Prisma 가 만들어 준 초안은 product_inquiries 를 **DROP 하고 inquiries 를 새로
  만들었다.** 이름이 바뀐 것을 "옛 표를 버리고 새 표를 세운 것" 으로 읽기
  때문인데, 그대로 두면 지금까지 들어온 문의와 답변이 전부 사라진다.

  표는 그대로 두고 이름만 바꾼다. 제약과 인덱스 이름도 같이 바꿔 준다 —
  이름을 두면 다음 migrate 가 표 이름에서 만들어 낸 이름과 어긋나 드리프트로
  잡힌다.
*/

-- CreateEnum
CREATE TYPE "SupportPostKind" AS ENUM ('NOTICE', 'FAQ');

-- CreateEnum
CREATE TYPE "InquiryTopic" AS ENUM ('DELIVERY', 'EXCHANGE', 'PAYMENT', 'ACCOUNT', 'PRODUCT', 'ETC');

-- RenameTable
ALTER TABLE "product_inquiries" RENAME TO "inquiries";

-- RenameConstraint
ALTER TABLE "inquiries" RENAME CONSTRAINT "product_inquiries_pkey" TO "inquiries_pkey";
ALTER TABLE "inquiries" RENAME CONSTRAINT "product_inquiries_productId_fkey" TO "inquiries_productId_fkey";
ALTER TABLE "inquiries" RENAME CONSTRAINT "product_inquiries_authorId_fkey" TO "inquiries_authorId_fkey";
ALTER TABLE "inquiries" RENAME CONSTRAINT "product_inquiries_answeredById_fkey" TO "inquiries_answeredById_fkey";

-- RenameIndex
ALTER INDEX "product_inquiries_productId_createdAt_idx" RENAME TO "inquiries_productId_createdAt_idx";
ALTER INDEX "product_inquiries_authorId_createdAt_idx" RENAME TO "inquiries_authorId_createdAt_idx";
ALTER INDEX "product_inquiries_answeredAt_createdAt_idx" RENAME TO "inquiries_answeredAt_createdAt_idx";

-- AlterTable
-- 상품 없는 문의(배송·환불 같은 것)를 받는다
ALTER TABLE "inquiries" ALTER COLUMN "productId" DROP NOT NULL;
ALTER TABLE "inquiries" ADD COLUMN "topic" "InquiryTopic";

-- CreateTable
CREATE TABLE "support_posts" (
    "id" TEXT NOT NULL,
    "kind" "SupportPostKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "topic" "InquiryTopic",
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "support_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_posts_kind_publishedAt_idx" ON "support_posts"("kind", "publishedAt");

-- AddForeignKey
ALTER TABLE "support_posts" ADD CONSTRAINT "support_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
