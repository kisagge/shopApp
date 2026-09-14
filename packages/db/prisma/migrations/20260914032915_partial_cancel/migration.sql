-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "couponShare" INTEGER,
ADD COLUMN     "pointsShare" INTEGER,
ADD COLUMN     "rewardShare" INTEGER;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "shippingPolicy" JSONB;

-- CreateTable
CREATE TABLE "order_refunds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "shippingDeducted" INTEGER NOT NULL DEFAULT 0,
    "itemIds" TEXT[],
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_refunds_idempotencyKey_key" ON "order_refunds"("idempotencyKey");

-- CreateIndex
CREATE INDEX "order_refunds_orderId_idx" ON "order_refunds"("orderId");

-- CreateIndex
CREATE INDEX "order_refunds_createdAt_idx" ON "order_refunds"("createdAt");

-- CreateIndex
CREATE INDEX "order_items_merchantId_canceledAt_idx" ON "order_items"("merchantId", "canceledAt");

-- AddForeignKey
ALTER TABLE "order_refunds" ADD CONSTRAINT "order_refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 옛 환불을 옮겨 적는다
--
-- 지금까지 환불은 "환불 상태(취소·환불완료)이고 결제된 적 있는 주문의 결제액" 으로 셌다
-- (dashboard 의 refundedIn). 매출이 이 표의 합으로 옮겨 가므로, 옛 주문을 **같은 조건으로**
-- 한 줄씩 적어 둔다. 조건이 달라지면 지난달 순매출이 마이그레이션 하나로 바뀐다.
INSERT INTO "order_refunds" ("id", "orderId", "amount", "points", "shippingDeducted", "itemIds", "kind", "reason", "actorId", "createdAt")
SELECT
  'backfill_' || o."id",
  o."id",
  o."payable",
  o."pointsUsed",
  0,
  ARRAY(SELECT i."id" FROM "order_items" i WHERE i."orderId" = o."id" ORDER BY i."id"),
  CASE WHEN o."status" = 'REFUNDED' THEN 'REFUND' ELSE 'CANCEL' END,
  '부분 취소 도입 전 기록',
  'system',
  o."canceledAt"
FROM "orders" o
WHERE o."status" IN ('CANCELLED', 'REFUNDED')
  AND o."paidAt" IS NOT NULL
  AND o."canceledAt" IS NOT NULL;

-- 줄의 취소 시각. 가맹점 매출·정산이 이 칸으로 환불을 센다
UPDATE "order_items" i
SET "canceledAt" = o."canceledAt"
FROM "orders" o
WHERE i."orderId" = o."id"
  AND o."status" IN ('CANCELLED', 'REFUNDED')
  AND o."canceledAt" IS NOT NULL;
