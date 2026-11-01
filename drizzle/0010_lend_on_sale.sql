ALTER TABLE "lend_entry" ADD COLUMN "sale" uuid;--> statement-breakpoint
ALTER TABLE "lend_entry" ADD CONSTRAINT "lend_entry_sale_item_sale_bill_id_fk" FOREIGN KEY ("sale") REFERENCES "public"."item_sale_bill"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- The shop writes an order's advance under सावकारी पेठे, as it does money a customer leaves with it.
INSERT INTO "daybook_rule" ("kind", "head")
SELECT v.kind, h."id"
FROM (VALUES
  ('order.gold', 'credit', 'Savkari (Moneylending)'), ('order.silver', 'credit', 'Savkari (Moneylending)')
) AS v("kind", "side", "name_en")
JOIN "daybook_head" h ON h."side" = v."side" AND h."name_en" = v."name_en"
ON CONFLICT ("kind") DO UPDATE SET "head" = EXCLUDED."head", "updated_at" = now();
