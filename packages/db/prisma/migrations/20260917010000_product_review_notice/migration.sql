-- 검수 결과를 가맹점에 알린다.
--
-- 사유는 이미 받고 있었다 — reviewProduct 는 사유 없는 반려를 막고 그 글을
-- 상품 행(publishRejection)에 적어 둔다. 적어 두기만 했다: 가맹점은 자기
-- 상품을 다시 열어 봐야 그것을 본다. 검수는 며칠 걸리는 일이라 다시 열어 볼
-- 이유가 없고, 그래서 사유를 쓰게 한 뜻이 닿지 않았다.
--
-- 둘 다 운영 알림함(CONSOLE)으로 간다. 상품을 올린 사람이 들을 말이지,
-- 손님으로 들어온 자리에 뜰 말이 아니다.
ALTER TYPE "NotificationKind" ADD VALUE 'PRODUCT_APPROVED';
ALTER TYPE "NotificationKind" ADD VALUE 'PRODUCT_REJECTED';
