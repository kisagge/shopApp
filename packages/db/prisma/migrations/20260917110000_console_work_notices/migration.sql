-- 처리할 일을 운영 알림함에 알린다 — 반품·교환 신청, 상품 문의, 고객센터 문의, 입점 신청.
--
-- 운영 알림함에는 가맹점에게 가는 소식(재고·검수·정산)만 왔다. 손님이 반품을 신청하거나 문의를 남기거나
-- 새 가맹점이 신청해도, 누군가 목록을 열어 보기 전까지 아무도 몰랐다.
--
-- 지난 신청에는 소급해 만들지 않는다. 이미 처리했을 수 있고, 없던 알림을 지금 넣으면 "방금 온 일" 로 읽힌다.
ALTER TYPE "NotificationKind" ADD VALUE 'RETURN_REQUESTED';
ALTER TYPE "NotificationKind" ADD VALUE 'INQUIRY_RECEIVED';
ALTER TYPE "NotificationKind" ADD VALUE 'SUPPORT_INQUIRY_RECEIVED';
ALTER TYPE "NotificationKind" ADD VALUE 'MERCHANT_APPLIED';
