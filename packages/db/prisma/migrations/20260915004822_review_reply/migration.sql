-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'REVIEW_REPLIED';

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "repliedAt" TIMESTAMP(3),
ADD COLUMN     "repliedById" TEXT,
ADD COLUMN     "reply" TEXT,
ADD COLUMN     "replyEditedAt" TIMESTAMP(3);
