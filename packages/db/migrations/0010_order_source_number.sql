-- Shopify's order name (e.g. "#1042") so merchants can tie an interview back
-- to the order in their own systems. Earlier orders stay null.
ALTER TABLE "orders" ADD COLUMN "source_order_number" text;
