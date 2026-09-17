-- 정산 지급 보류의 까닭.
--
-- 보류(HELD) 상태는 처음부터 있었는데 보류할 길이 없었다. 이제 슈퍼관리자가 확정된 정산의 지급을 까닭과 함께
-- 멈추고 풀 수 있다. 까닭은 가맹점도 본다 — 들어올 돈이 왜 안 들어오는지 알아야 한다.
ALTER TABLE "settlements" ADD COLUMN     "heldReason" TEXT;
