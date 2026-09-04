-- CreateTable
CREATE TABLE "product_inquiries" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "answer" TEXT,
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "product_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_inquiries_productId_createdAt_idx" ON "product_inquiries"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "product_inquiries_authorId_createdAt_idx" ON "product_inquiries"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "product_inquiries_answeredAt_createdAt_idx" ON "product_inquiries"("answeredAt", "createdAt");

-- AddForeignKey
ALTER TABLE "product_inquiries" ADD CONSTRAINT "product_inquiries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_inquiries" ADD CONSTRAINT "product_inquiries_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_inquiries" ADD CONSTRAINT "product_inquiries_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
