-- CreateTable
CREATE TABLE "product_slugs" (
    "slug" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_slugs_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "collection_slugs" (
    "slug" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_slugs_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "product_slugs_productId_idx" ON "product_slugs"("productId");

-- CreateIndex
CREATE INDEX "collection_slugs_collectionId_idx" ON "collection_slugs"("collectionId");

-- AddForeignKey
ALTER TABLE "product_slugs" ADD CONSTRAINT "product_slugs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_slugs" ADD CONSTRAINT "collection_slugs_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
