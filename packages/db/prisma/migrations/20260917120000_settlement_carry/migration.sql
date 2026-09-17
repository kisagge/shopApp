-- 지급액이 음수인 정산을 다음 달로 넘긴다.
--
-- 환불이 매출을 넘은 달은 지급액이 음수로 확정되는데, 지급은 음수를 "수동 처리" 로 막고 그 수동 처리의 길이 없었다.
-- 확정된 채 영영 남았고, 다음 달에는 그 빚을 모른 채 제 금액을 그대로 보냈다.
--
-- 이제 확정할 때 앞선 달의 아직 넘기지 않은 음수 지급액을 그 달 지급액에서 뺀다(carriedAmount). 넘겨진 달은
-- CARRIED 가 되고 어느 달이 떠안았는지(carriedIntoId)를 남긴다. 이미 음수로 확정돼 있던 달은 다음 확정 때 넘어간다.
ALTER TYPE "SettlementStatus" ADD VALUE 'CARRIED';

ALTER TABLE "settlements" ADD COLUMN     "carriedAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "carriedIntoId" TEXT;

ALTER TABLE "settlements" ADD CONSTRAINT "settlements_carriedIntoId_fkey" FOREIGN KEY ("carriedIntoId") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
