-- CreateTable
CREATE TABLE "return_addresses" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT,
    "recipient" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "address1" TEXT NOT NULL,
    "address2" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "return_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "return_addresses_merchantId_key" ON "return_addresses"("merchantId");

-- AddForeignKey
ALTER TABLE "return_addresses" ADD CONSTRAINT "return_addresses_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

