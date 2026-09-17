-- 취소한 주문에 들어온 가상계좌 입금을 남긴다.
--
-- 입금 대기 주문을 취소해도 PG 쪽 가상계좌를 닫지 않아, 손님이 그 뒤에 입금하면 돈은
-- 들어오는데 입금 처리는 "취소 → 결제완료" 전환에서 예외로 멈췄다. 웹훅은 끝없이
-- 재시도했고, 받은 돈은 아무 데도 적히지 않았다. 이제 취소할 때 계좌를 닫고, 그래도
-- 엇갈려 들어온 입금은 여기 남겨 사람이 환불한다(입금 뒤 환불은 손님 계좌가 필요하다).
--
-- 덧붙이기만 한다.
ALTER TABLE "payments" ADD COLUMN "lateDepositAt" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN "lateDepositAmount" INTEGER;
ALTER TABLE "payments" ADD COLUMN "lateDepositResolvedAt" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN "lateDepositResolvedBy" TEXT;

CREATE INDEX "payments_lateDepositAt_idx" ON "payments"("lateDepositAt");
