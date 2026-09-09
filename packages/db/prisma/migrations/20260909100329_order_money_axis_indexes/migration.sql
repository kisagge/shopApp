-- CreateIndex
CREATE INDEX "orders_paidAt_idx" ON "orders"("paidAt");

-- CreateIndex
CREATE INDEX "orders_status_canceledAt_idx" ON "orders"("status", "canceledAt");

-- CreateIndex
CREATE INDEX "orders_status_confirmedAt_idx" ON "orders"("status", "confirmedAt");

-- CreateIndex
CREATE INDEX "orders_status_deliveredAt_idx" ON "orders"("status", "deliveredAt");
