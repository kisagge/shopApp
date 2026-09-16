-- 반려라는 상태가 없어서 해지(TERMINATED)를 대신 쓰고 있었다.
--
-- 그래서 한 번도 승인된 적 없는 신청이 "해지" 로 적혔고, 나중에 읽는 사람은 이
-- 가맹점이 장사를 하다 그만둔 것인지 애초에 들어온 적이 없는 것인지 가릴 수 없었다.
-- 둘 다 다시 신청할 수 있다는 점은 같지만(core 의 OPEN_MERCHANT_STATUS), 같은 값에
-- 담아 두면 그 사실이 지워진다.
--
-- 지난 행은 건드리지 않는다. 어느 TERMINATED 가 사실은 반려였는지 되짚을 근거가
-- 없다 — 승인 시각(approvedAt)이 비어 있다는 것만으로는 단정할 수 없고, 지어내
-- 고치면 감사 기록이 거짓이 된다.
ALTER TYPE "MerchantStatus" ADD VALUE 'REJECTED';

-- 검수 결과에 이어, 입점 결과도 신청한 사람에게 알린다.
ALTER TYPE "NotificationKind" ADD VALUE 'MERCHANT_APPROVED';
ALTER TYPE "NotificationKind" ADD VALUE 'MERCHANT_REJECTED';
