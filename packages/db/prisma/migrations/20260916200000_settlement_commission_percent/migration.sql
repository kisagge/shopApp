-- 확정된 정산이 그때의 수수료율을 들고 있게 한다.
-- 금액만 얼려 두면 "몇 퍼센트였는가" 에 답할 것이 없어서, 요율을 바꾸면
-- 지난 기간의 내역 내려받기가 새 요율로 다시 계산돼 확정된 행과 어긋났다.
ALTER TABLE "settlements" ADD COLUMN "commissionPercent" INTEGER NOT NULL DEFAULT 0;

-- 이미 있는 행은 **얼려 둔 금액에서 되짚는다.** 가맹점의 지금 요율을 적어 넣으면
-- 그 행이 실제로 어떤 요율로 만들어졌는지와 어긋날 수 있다 — 그 사이 요율이 바뀌었다면.
-- 매출이 0 인 기간은 되짚을 것이 없어 가맹점의 현재 요율을 쓴다.
UPDATE "settlements" s
SET "commissionPercent" = CASE
  WHEN s."grossAmount" > 0
    THEN ROUND(s."commissionAmount" * 100.0 / s."grossAmount")
  ELSE COALESCE((SELECT m."commissionPercent" FROM "merchants" m WHERE m.id = s."merchantId"), 0)
END;
