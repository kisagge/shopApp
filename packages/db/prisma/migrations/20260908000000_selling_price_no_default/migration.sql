-- 파는 가격(sellingPrice) 되메우기 + 기본값 제거.
--
-- 시드가 이 칸을 쓰지 않아 @default(0) 이 그대로 남은 행이 있었다. 파는
-- 가격이 0 이면 가격 범위 필터에 걸리지 않고 가격순 정렬에서 맨 앞에 선다.
-- 서른넷 중 스물여섯이 그랬다.
--
-- 순서가 중요하다. 되메운 뒤에 기본값을 없앤다.

UPDATE "products"
SET "sellingPrice" = COALESCE("salePrice", "listPrice")
WHERE "sellingPrice" <> COALESCE("salePrice", "listPrice");

-- 기본값이 없으면 이 칸을 빠뜨린 create 가 타입 오류가 된다.
ALTER TABLE "products" ALTER COLUMN "sellingPrice" DROP DEFAULT;
