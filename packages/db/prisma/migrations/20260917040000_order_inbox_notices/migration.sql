-- 주문 접수·가상계좌 발급·입금 확인을 알림함에도 남긴다.
--
-- 이 셋만 메일로만 나가고 있었다. 배송·취소·환불·반품은 전부 알림함에도 남는데,
-- 가장 많이 오가고 가장 마음 졸이며 확인하는 세 가지가 빠져 있었다 — 알림함을
-- 만든 이유가 "메일은 스팸함으로 가기도 한다" 인데, 정작 돈이 오가는 자리에는
-- 그 대비가 없었다.
--
-- 지난 주문에는 소급해 만들지 않는다. 그때 보낸 메일은 이미 나갔고, 없던 알림을
-- 지금 만들어 넣으면 "방금 온 소식" 으로 읽힌다.
ALTER TYPE "NotificationKind" ADD VALUE 'ORDER_PAID';
ALTER TYPE "NotificationKind" ADD VALUE 'ORDER_PENDING';
ALTER TYPE "NotificationKind" ADD VALUE 'ORDER_DEPOSITED';
