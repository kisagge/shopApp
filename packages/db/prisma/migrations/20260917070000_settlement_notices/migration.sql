-- 정산 마감·지급을 가맹점에게 알린다.
--
-- 돈이 오갔는데 아무 말도 하지 않았다. 마감은 배치가 새벽에 돌고 지급은 운영진이
-- 누른다 — 둘 다 가맹점이 없는 자리에서 일어나는 일이라, 가맹점은 정산 화면을 열어
-- 뱃지가 "지급됨" 으로 바뀐 것을 보고서야 알았다.
--
-- 이미 확정·지급된 정산에는 소급해 만들지 않는다. 지난달 지급이 오늘 온 소식으로
-- 읽히면, 받은 적 없는 돈을 기다리게 된다.
ALTER TYPE "NotificationKind" ADD VALUE 'SETTLEMENT_CLOSED';
ALTER TYPE "NotificationKind" ADD VALUE 'SETTLEMENT_PAID';
