CREATE TABLE "misc_trade_payment" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade" uuid NOT NULL,
	"date" timestamp,
	"amt" numeric(14, 2),
	"mode" text
);
--> statement-breakpoint
ALTER TABLE "misc_trade" ADD COLUMN "paid_amt" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "misc_trade" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "bill" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "misc_trade_payment" ADD CONSTRAINT "misc_trade_payment_trade_misc_trade_id_fk" FOREIGN KEY ("trade") REFERENCES "public"."misc_trade"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Every misc trade so far was paid in full when it was made.
UPDATE "misc_trade" SET "paid_amt" = "amt" WHERE "paid_amt" IS NULL;--> statement-breakpoint
-- The heads as the shop keeps them: a supplier's bill and its payments under the metal's purchase
-- head, old metal bought and langdi sold under भंगारे पेठे. A supplier's refund is now kept by metal.
DELETE FROM "daybook_rule" WHERE "kind" = 'supplier_return';--> statement-breakpoint
INSERT INTO "daybook_rule" ("kind", "head")
SELECT v.kind, h."id"
FROM (VALUES
  ('supplier.gold', 'debit', 'Gold Purchase'), ('supplier.silver', 'debit', 'Silver Purchase'),
  ('supplier_return.gold', 'debit', 'Gold Purchase'), ('supplier_return.silver', 'debit', 'Silver Purchase'),
  ('old.gold', 'debit', 'Bhangare Pethe'), ('old.silver', 'debit', 'Bhangare Pethe'),
  ('langdi.gold', 'credit', 'Bhangare Pethe'), ('langdi.silver', 'credit', 'Bhangare Pethe')
) AS v("kind", "side", "name_en")
JOIN "daybook_head" h ON h."side" = v."side" AND h."name_en" = v."name_en"
ON CONFLICT ("kind") DO UPDATE SET "head" = EXCLUDED."head", "updated_at" = now();