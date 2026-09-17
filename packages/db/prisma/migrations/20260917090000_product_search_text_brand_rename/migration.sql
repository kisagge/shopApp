-- 브랜드 이름을 바꾼 뒤 옛 이름으로 남은 상품 검색 문자열을 바로잡는다.
--
-- 상품 검색은 상품 행에 복사해 둔 "상품명 + 브랜드명"(소문자)을 본다. 브랜드 이름을 고치는
-- 화면이 그 복사본을 함께 고치지 않아, 이름을 바꾼 브랜드는 새 이름으로 검색하면 상품이
-- 나오지 않았다. 앱은 이제 이름을 바꿀 때 함께 고친다(manage-brand). 여기서는 그 전에 바뀐
-- 것만 한 번 바로잡는다.
--
-- · 어긋난 줄만 고친다. 두 번 돌아도 결과가 같다.
-- · 규칙은 앱의 searchTextFor(`${name} ${brandName}`.toLowerCase()) 와 같은 모양이다. 시드와
--   운영의 이름은 한글·영문이라 Postgres 의 lower() 와 결과가 같다 — 이 한 번을 위해 규칙을
--   SQL 에 옮겨 적었을 뿐, 앱의 쓰기는 계속 core 규칙 하나를 쓴다.
UPDATE "products" AS p
   SET "searchText" = lower(p."name" || ' ' || b."name")
  FROM "brands" AS b
 WHERE p."brandId" = b."id"
   AND p."searchText" IS DISTINCT FROM lower(p."name" || ' ' || b."name");
