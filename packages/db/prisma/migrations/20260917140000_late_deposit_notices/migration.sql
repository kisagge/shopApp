-- 취소한 주문에 들어온 입금을 손님과 운영진에게 알린다.
--
-- 받은 돈은 적어 두고 운영 화면에만 띄웠다. 손님은 돈을 보냈는데 주문은 취소된 채라 무슨 일인지 몰랐고, 돌려받으려면
-- 계좌를 알려야 한다는 것도 몰랐다 — 운영진이 먼저 연락하기 전까지 아무 일도 일어나지 않았다.
--
-- 지난 입금에는 소급해 만들지 않는다. 이미 돌려주었을 수 있고, 지금 넣으면 "방금 온 일" 로 읽힌다.
ALTER TYPE "NotificationKind" ADD VALUE 'LATE_DEPOSIT_RECEIVED';
ALTER TYPE "NotificationKind" ADD VALUE 'LATE_DEPOSIT_REFUNDED';
ALTER TYPE "NotificationKind" ADD VALUE 'LATE_DEPOSIT_FOUND';
