-- DropForeignKey
ALTER TABLE "admin_audit_logs" DROP CONSTRAINT "admin_audit_logs_actorId_fkey";

-- AlterTable
ALTER TABLE "admin_audit_logs" ADD COLUMN     "actorLabel" TEXT,
ALTER COLUMN "actorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
