-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "discountRuleId" TEXT,
ADD COLUMN     "discountTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxTotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "total" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SubscriptionLine" ADD COLUMN     "discountAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "lineSubtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxBreakdown" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "taxRate" DECIMAL(7,4) NOT NULL DEFAULT 0,
ADD COLUMN     "taxableAmount" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "total" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_discountRuleId_fkey" FOREIGN KEY ("discountRuleId") REFERENCES "DiscountRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Line and document amounts are never negative; the subscription total is the
-- server-computed sum of its lines (QUO-03).
ALTER TABLE "SubscriptionLine" ADD CONSTRAINT "SubscriptionLine_amounts_check"
  CHECK ("lineSubtotal" >= 0 AND "discountAmount" >= 0 AND "discountAmount" <= "lineSubtotal"
         AND "taxableAmount" >= 0 AND "taxRate" >= 0 AND "taxAmount" >= 0 AND "total" >= 0);
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_amounts_check"
  CHECK ("subtotal" >= 0 AND "discountTotal" >= 0 AND "taxTotal" >= 0 AND "total" >= 0);
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_dates_check"
  CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_quote_dates_check"
  CHECK ("quoteValidUntil" IS NULL OR "quoteIssuedOn" IS NULL OR "quoteValidUntil" >= "quoteIssuedOn");
