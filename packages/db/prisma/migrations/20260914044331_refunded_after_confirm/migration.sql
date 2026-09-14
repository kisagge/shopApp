-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "refundedAfterConfirm" BOOLEAN NOT NULL DEFAULT false;

-- 구매확정된 뒤 주문째 환불된 옛 줄. 정산이 "확정 뒤 돌아간 돈" 으로 차감하던 것과 같은 조건이다
UPDATE "order_items" i
SET "refundedAfterConfirm" = true
FROM "orders" o
WHERE i."orderId" = o."id"
  AND o."confirmedAt" IS NOT NULL
  AND o."status" IN ('CANCELLED', 'REFUNDED')
  AND i."canceledAt" IS NOT NULL;
