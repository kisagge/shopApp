-- 리뷰 적립이 어느 구매에 대한 것인지.
-- 리뷰 id 가 아니라 주문 항목 id 다 — 본인이 지운 리뷰는 행이 남지 않아
-- "이미 준 적이 있는가" 에 답할 것이 사라진다.
ALTER TABLE "point_transactions" ADD COLUMN "orderItemId" TEXT;

CREATE INDEX "point_transactions_orderItemId_reason_idx" ON "point_transactions"("orderItemId", "reason");

ALTER TABLE "point_transactions"
  ADD CONSTRAINT "point_transactions_orderItemId_fkey"
  FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
