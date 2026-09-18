-- 정지·해지된 가맹점이 까닭을 알 수 있게 한다.
--
-- 처분에는 사유를 강제해 왔는데(불이익을 주는 처분에는 이유를 남긴다) 정지·해지의 사유는 감사 로그에만 남아,
-- 정작 멈춘 가게에는 닿지 않았다. 반려 사유와 칸을 나눈다 — 반려는 못 들어온 것이고 정지는 멈춘 것이라,
-- 한 칸에 두면 신청 화면이 지난 정지 사유를 반려 사유로 읽는다.
--
-- 지난 처분의 사유는 채우지 않는다. 감사 로그에 있고, 지금 와서 옮겨 적으면 "방금 적은 사유" 로 읽힌다.
ALTER TABLE "merchants" ADD COLUMN "suspendedReason" TEXT;

-- 정지·해지된 가게도 그 사실을 알림함에서 듣는다. 운영 화면이 닫힌 사람들이라 매장 알림함으로 간다.
ALTER TYPE "NotificationKind" ADD VALUE 'MERCHANT_SUSPENDED';
ALTER TYPE "NotificationKind" ADD VALUE 'MERCHANT_TERMINATED';
