-- CreateTable
CREATE TABLE "notification_templates" (
    "kind" "NotificationKind" NOT NULL,
    "locale" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("kind","locale")
);
