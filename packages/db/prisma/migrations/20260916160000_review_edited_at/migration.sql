-- 글쓴이가 고친 시각. 화면이 "수정됨" 이라고 적는 근거다.
-- updatedAt 은 도움돼요 표가 오갈 때도 바뀌므로 이 물음에 답할 수 없다.
ALTER TABLE "reviews" ADD COLUMN "editedAt" TIMESTAMP(3);
