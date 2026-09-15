-- CreateTable
CREATE TABLE "inquiry_images" (
    "id" TEXT NOT NULL,
    "inquiryId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inquiry_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inquiry_images_inquiryId_idx" ON "inquiry_images"("inquiryId");

-- AddForeignKey
ALTER TABLE "inquiry_images" ADD CONSTRAINT "inquiry_images_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

