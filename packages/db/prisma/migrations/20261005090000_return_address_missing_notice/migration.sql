-- 반품 신청이 들어왔는데 보낼 곳이 없다 — 등록할 사람에게 그 자리에서 알린다.
--
-- 반품지가 없으면 승인할 수 없다(core missingReturnAddresses). 그런데 그 사실은 승인을 누르려다 막히고
-- 나서야 드러났고, 누를 생각을 안 하면 영영 드러나지 않았다 — 그사이 손님의 신청은 대기열에 갇혀 있고,
-- 손님 화면에는 "승인을 기다리는 중" 만 뜬다.
ALTER TYPE "NotificationKind" ADD VALUE 'RETURN_ADDRESS_MISSING';
