-- ── 진짜 사진 옆에 남은 시드 자리표시를 치운다
--
-- 시드는 상품마다 앱 안의 회색 자리표시(/seed/…)를 한 장 넣고, 진짜 사진 스크립트는 사진을
-- 추가만 했다. 둘 다 순서가 0 이라 한 장만 집는 카드(매대·기획전·장바구니)에서 DB 가 아무거나
-- 줘서 운영의 기획전 화면에 회색 네모가 떴다. 상세는 여러 장을 보여 줘서 멀쩡해 보였다.
--
-- **진짜 사진이 있는 상품의 자리표시만** 지운다. 사진이 자리표시뿐인 상품(갓 만든 DB, CI)은
-- 그대로 둔다 — 없애면 카드에 사진 칸이 아예 안 그려진다. 스키마는 바꾸지 않는다.
DELETE FROM "product_images" AS placeholder
WHERE placeholder."url" LIKE '/seed/%'
  AND EXISTS (
    SELECT 1 FROM "product_images" AS photo
    WHERE photo."productId" = placeholder."productId"
      AND photo."url" NOT LIKE '/seed/%'
  );
