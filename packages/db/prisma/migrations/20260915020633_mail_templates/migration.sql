-- CreateTable
CREATE TABLE "mail_templates" (
    "kind" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "subject" TEXT,
    "heading" TEXT,
    "lead" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_templates_pkey" PRIMARY KEY ("kind","locale")
);
