-- CreateEnum
CREATE TYPE "PolicyKind" AS ENUM ('TERMS', 'PRIVACY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "marketingAgreedAt" TIMESTAMP(3),
ADD COLUMN     "termsAgreedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "policies" (
    "kind" "PolicyKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyRich" JSONB,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("kind")
);

-- CreateTable
CREATE TABLE "policy_revisions" (
    "id" TEXT NOT NULL,
    "kind" "PolicyKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyRich" JSONB,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "replacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "policy_revisions_kind_replacedAt_idx" ON "policy_revisions"("kind", "replacedAt");

-- AddForeignKey
ALTER TABLE "policy_revisions" ADD CONSTRAINT "policy_revisions_kind_fkey" FOREIGN KEY ("kind") REFERENCES "policies"("kind") ON DELETE CASCADE ON UPDATE CASCADE;

