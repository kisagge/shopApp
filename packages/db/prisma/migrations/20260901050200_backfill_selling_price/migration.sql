-- 앞 마이그레이션이 sellingPrice 를 기본값 0 으로 추가했다.
-- 이미 있던 행은 그대로 0 이라 정렬과 가격 필터가 전부 틀어진다.
--
-- 컬럼 추가와 백필을 나눈 이유: 큰 테이블에서 ADD COLUMN ... UPDATE 를
-- 한 트랜잭션에 묶으면 그동안 테이블이 잠긴다. 나눠 두면 백필만 따로
-- 나눠 돌릴 수 있다.
UPDATE "products"
SET "sellingPrice" = COALESCE("salePrice", "listPrice")
WHERE "sellingPrice" = 0;
