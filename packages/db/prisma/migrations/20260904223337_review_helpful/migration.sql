-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "helpfulCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "review_helpfuls" (
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_helpfuls_pkey" PRIMARY KEY ("reviewId","userId")
);

-- CreateIndex
CREATE INDEX "review_helpfuls_userId_idx" ON "review_helpfuls"("userId");

-- CreateIndex
CREATE INDEX "reviews_productId_helpfulCount_idx" ON "reviews"("productId", "helpfulCount");

-- AddForeignKey
ALTER TABLE "review_helpfuls" ADD CONSTRAINT "review_helpfuls_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_helpfuls" ADD CONSTRAINT "review_helpfuls_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
