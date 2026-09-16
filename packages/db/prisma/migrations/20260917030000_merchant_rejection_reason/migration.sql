-- 반려 사유를 행에 남긴다.
--
-- 알림에는 한 줄에 들어갈 만큼만 줄여 싣는다. 전문은 신청 화면이 보여 줘야
-- 무엇을 고쳐 다시 낼지 알 수 있다 — 상품 검수의 publishRejection 과 같은 결이다.
-- 지금까지는 감사 로그에만 있었고, 신청한 사람은 볼 수 없는 자리였다.
ALTER TABLE "merchants" ADD COLUMN "rejectionReason" TEXT;
